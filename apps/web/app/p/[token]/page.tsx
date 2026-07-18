import type { Metadata } from 'next';
import { api } from '../../../lib/api';

interface Props {
  params: { token: string };
}

export const metadata: Metadata = {
  title: 'Photo — Neon Gather BKK',
};

/** Public share page — server-rendered, looked up by unguessable token. */
export default async function SharedPhotoPage({ params }: Props) {
  const { token } = params;
  let photo: Awaited<ReturnType<typeof api.sharedPhoto>> | null = null;
  try {
    photo = await api.sharedPhoto(token);
  } catch {
    photo = null;
  }

  if (!photo) {
    return (
      <main className="container">
        <div className="card">
          <h3>Photo not found</h3>
          <p className="muted">This share link is invalid or the photo was deleted.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ maxWidth: 720 }}>
      <div className="brand" style={{ marginBottom: 16 }}>
        Neon <span>Gather</span> BKK
      </div>
      <div className="card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption || 'booth photo'}
          style={{ width: '100%', borderRadius: 12 }}
        />
        <p style={{ marginTop: 12 }}>
          {photo.caption || 'A moment on the Avenue'}{' '}
          <span className="muted">
            — by <b>{photo.owner_name || 'a player'}</b>,{' '}
            {new Date(photo.created_at).toLocaleDateString()}
          </span>
        </p>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Taken in the photo booth at Neon Gather BKK — a cozy community-mall world.
      </p>
    </main>
  );
}
