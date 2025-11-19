import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { rows } = await sql`SELECT id, name, time FROM leaderboard ORDER BY time ASC LIMIT 100`;
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, time } = await request.json();
    if (!name || typeof time !== 'number' || time < 0.030 || time > 3 || name.length > 15) {
      return new NextResponse('Invalid', { status: 400 });
    }
    await sql`INSERT INTO leaderboard (name, time) VALUES (${name}, ${time})`;
    return new NextResponse('OK');
  } catch (error) {
    return new NextResponse('Error', { status: 500 });
  }
}

export const runtime = 'edge';