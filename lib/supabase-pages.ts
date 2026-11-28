import { connect } from './supabase';

type Client = NonNullable<ReturnType<typeof connect>>;

export async function allRows<T>(client: Client, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from(table).select(columns).order('id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data as T[]));
    if (!data || data.length < 500) return rows;
  }
}
