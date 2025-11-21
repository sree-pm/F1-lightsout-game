import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const result = await sql`SELECT * FROM leaderboard ORDER BY time ASC LIMIT 20;`;
    return NextResponse.json(result.rows, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, time } = await request.json();

    // Basic validation
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 15) {
      return NextResponse.json({ error: 'Invalid name.' }, { status: 400 });
    }
    if (typeof time !== 'number' || time < 0.01) { // Reject impossible scores
      return NextResponse.json({ error: 'Invalid time.' }, { status: 400 });
    }

    await sql`INSERT INTO leaderboard (name, time) VALUES (${name.trim()}, ${time});`;
    return NextResponse.json({ message: 'Score submitted.' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
}
