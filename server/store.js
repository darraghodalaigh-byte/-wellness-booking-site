import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOOKINGS_FILE = path.join(__dirname, '..', 'data', 'bookings.json');

async function ensureBookingsFile() {
  try {
    await fs.access(BOOKINGS_FILE);
  } catch {
    await fs.mkdir(path.dirname(BOOKINGS_FILE), { recursive: true });
    await fs.writeFile(BOOKINGS_FILE, '[]\n', 'utf8');
  }
}

export async function getBookings() {
  await ensureBookingsFile();
  const raw = await fs.readFile(BOOKINGS_FILE, 'utf8');
  return JSON.parse(raw || '[]');
}

export async function saveBookings(bookings) {
  await ensureBookingsFile();
  const payload = JSON.stringify(bookings, null, 2);
  await fs.writeFile(BOOKINGS_FILE, `${payload}\n`, 'utf8');
}
