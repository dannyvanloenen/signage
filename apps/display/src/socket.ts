import { io } from 'socket.io-client';
import { API_URL } from './api';

export function connectDisplay(token: string, onUpdate: () => void): () => void {
  const socket = io(`${API_URL}/display`, {
    query: { public_token: token },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
  });

  socket.on('connect', () => {
    setStatus('online');
  });

  socket.on('disconnect', () => {
    setStatus('offline');
  });

  socket.on('menu:updated', () => {
    onUpdate();
  });

  return () => socket.disconnect();
}

function setStatus(state: 'online' | 'offline') {
  const el = document.getElementById('connection-status');
  if (!el) return;
  el.dataset.state = state;
}
