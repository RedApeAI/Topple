export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Add your Neon connection string to the environment.",
    );
  }

  return url;
}
