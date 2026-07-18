package ws

import (
	"encoding/json"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	PlayerID    string
	DisplayName string
	conn        *websocket.Conn
	send        chan []byte
	hub         *Hub
}

func NewClient(hub *Hub, conn *websocket.Conn, playerID, displayName string) *Client {
	return &Client{
		PlayerID:    playerID,
		DisplayName: displayName,
		conn:        conn,
		send:        make(chan []byte, 32),
		hub:         hub,
	}
}

// Start registers the client, sends the initial snapshot (players + tables),
// then runs the read/write loops. Blocks until the socket closes.
func (c *Client) Start(tables []TableView) {
	c.hub.setPlayer(&Player{ID: c.PlayerID, DisplayName: c.DisplayName, Dir: "down"})
	c.hub.add(c)

	c.trySend(mustJSON(map[string]any{
		"type":    "snapshot",
		"players": c.hub.Players(),
		"tables":  tables,
	}))
	c.hub.Broadcast(mustJSON(map[string]any{
		"type":   "player_joined",
		"player": Player{ID: c.PlayerID, DisplayName: c.DisplayName, Dir: "down"},
	}))

	go c.writeLoop()
	c.readLoop()
}

func (c *Client) trySend(msg []byte) {
	select {
	case c.send <- msg:
	default:
	}
}

func (c *Client) readLoop() {
	defer func() {
		c.hub.remove(c)
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(4096)
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		c.handle(data)
	}
}

func (c *Client) writeLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

type moveMsg struct {
	Type string  `json:"type"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Dir  string  `json:"dir"`
}

func (c *Client) handle(data []byte) {
	var m moveMsg
	if err := json.Unmarshal(data, &m); err != nil {
		return
	}
	if m.Type == "move" {
		p := &Player{ID: c.PlayerID, DisplayName: c.DisplayName, X: m.X, Y: m.Y, Dir: safeDir(m.Dir)}
		c.hub.setPlayer(p)
		c.hub.Broadcast(mustJSON(map[string]any{"type": "player_moved", "player": *p}))
	}
}

func safeDir(d string) string {
	switch d {
	case "up", "down", "left", "right":
		return d
	default:
		return "down"
	}
}
