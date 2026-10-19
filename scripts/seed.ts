import { closeDatabase, getDatabase } from "../src/lib/server/db";

const seedServices = [
  [
    "00000000-0000-4000-8000-000000000001",
    "Classic Lashes",
    "One extension per natural lash for a soft, defined look.",
    6000,
    120,
    15,
  ],
  [
    "00000000-0000-4000-8000-000000000002",
    "Volume Lashes",
    "Handmade fans for a fuller, fluffier finish.",
    8000,
    150,
    15,
  ],
  [
    "00000000-0000-4000-8000-000000000003",
    "Lash Refill",
    "Maintenance within 2–3 weeks of a full set.",
    4000,
    75,
    15,
  ],
  [
    "00000000-0000-4000-8000-000000000004",
    "Occasion Makeup",
    "Long-wear makeup for events, photos and celebrations.",
    5500,
    60,
    15,
  ],
] as const;

try {
  const { client } = await getDatabase();
  for (const service of seedServices) {
    await client.query(
      `INSERT INTO services (id, name, description, price_minor, duration_minutes, buffer_minutes)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [...service],
    );
  }
  const hours = [
    [0, false, 600, 960, []],
    [1, true, 540, 1080, []],
    [2, true, 540, 1080, []],
    [3, true, 540, 1080, []],
    [4, true, 540, 1080, []],
    [5, true, 540, 1080, []],
    [6, true, 600, 900, []],
  ] as const;
  for (const [weekday, open, start, end, breaks] of hours) {
    await client.query(
      `INSERT INTO working_hours (weekday, is_open, start_minute, end_minute, breaks)
       VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (weekday) DO NOTHING`,
      [weekday, open, start, end, JSON.stringify(breaks)],
    );
  }
  await client.query("INSERT INTO business_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
  console.log(
    "Development sample services and hours inserted where missing. No clients or bookings were created.",
  );
} finally {
  await closeDatabase();
}
