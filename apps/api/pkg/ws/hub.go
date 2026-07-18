// Package ws is a minimal WebSocket hub for realtime avatar sync and table
// broadcasts. Framework-free so both handlers and the AutoServeBot can use it.
package ws

import (
	"encoding/json"
	"sync"
)

type Player struct {
	ID          string  `json:"id"`
	DisplayName string  `json:"display_name"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Dir         string  `json:"dir"`
}

type TableView struct {
	ID        string `json:"id"`
	Code      string `json:"code"`
	GridX     int    `json:"grid_x"`
	GridY     int    `json:"grid_y"`
	State     string `json:"state"`
	OrderName string `json:"order_name"`
	UpdatedAt string `json:"updated_at"`
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]bool
	players map[string]*Player
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*Client]bool), players: make(map[string]*Player)}
}

func (h *Hub) add(c *Client) {
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
}

func (h *Hub) remove(c *Client) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.send)
	}
	delete(h.players, c.PlayerID)
	h.mu.Unlock()
	h.Broadcast(mustJSON(map[string]any{"type": "player_left", "id": c.PlayerID}))
}

func (h *Hub) setPlayer(p *Player) {
	h.mu.Lock()
	h.players[p.ID] = p
	h.mu.Unlock()
}

// Players returns a snapshot copy of all connected players.
func (h *Hub) Players() []Player {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]Player, 0, len(h.players))
	for _, p := range h.players {
		out = append(out, *p)
	}
	return out
}

// Broadcast pushes a message to every client (non-blocking; slow clients drop).
func (h *Hub) Broadcast(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.send <- msg:
		default:
		}
	}
}

// BroadcastTable notifies all clients of a table state change.
func (h *Hub) BroadcastTable(tv TableView) {
	h.Broadcast(mustJSON(map[string]any{"type": "table_updated", "table": tv}))
}

// BroadcastJSON marshals and broadcasts an arbitrary message to everyone.
func (h *Hub) BroadcastJSON(v any) {
	h.Broadcast(mustJSON(v))
}

// SendTo pushes a message to every connection of one player (no-op when the
// player is offline; async flows must tolerate that).
func (h *Hub) SendTo(playerID string, v any) {
	msg := mustJSON(v)
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.PlayerID == playerID {
			select {
			case c.send <- msg:
			default:
			}
		}
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
