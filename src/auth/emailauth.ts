import type { Env, AuthUser } from "../types";
import { hashPassword, verifyPassword } from "./password";
import { getDb } from "../db/client";

type UserRow = {
	id: number;
	sub: string;
	email: string;
	name: string;
	password_hash: string;
	created_at: number;
};

export async function getStoredUser(env: Env, email: string): Promise<UserRow | null> {
	const sql = getDb(env);
	const rows = await sql`
		SELECT * FROM users WHERE email = ${email.toLowerCase().trim()} LIMIT 1
	`;
	return (rows[0] as UserRow) ?? null;
}

export async function registerUser(
	env: Env,
	email: string,
	password: string,
	name: string,
): Promise<{ user: AuthUser } | { error: string }> {
	const normalEmail = email.toLowerCase().trim();

	if (password.length < 8) {
		return { error: "Password must be at least 8 characters." };
	}

	const existing = await getStoredUser(env, normalEmail);
	if (existing) {
		return { error: "An account with this email already exists." };
	}

	const passwordHash = await hashPassword(password);
	const sub = `email:${normalEmail}`;
	const displayName = name.trim() || normalEmail.split("@")[0]!;

	const sql = getDb(env);
	await sql`
		INSERT INTO users (sub, email, name, password_hash, created_at)
		VALUES (${sub}, ${normalEmail}, ${displayName}, ${passwordHash}, ${Date.now()})
	`;

	return { user: { sub, email: normalEmail, name: displayName } };
}

export async function loginUser(
	env: Env,
	email: string,
	password: string,
): Promise<{ user: AuthUser } | { error: string }> {
	const row = await getStoredUser(env, email);

	if (!row) {
		await verifyPassword(
			password,
			"pbkdf2:100000:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000",
		);
		return { error: "Invalid email or password." };
	}

	const valid = await verifyPassword(password, row.password_hash);
	if (!valid) {
		return { error: "Invalid email or password." };
	}

	return { user: { sub: row.sub, email: row.email, name: row.name } };
}
