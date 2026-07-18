/**
 * Email/password auth — user store backed by D1 (SQLite at the edge).
 * Table: users (id, sub, email, name, password_hash, created_at)
 */

import type { Env, AuthUser } from "../types";
import { hashPassword, verifyPassword } from "./password";

type UserRow = {
	id: number;
	sub: string;
	email: string;
	name: string;
	password_hash: string;
	created_at: number;
};

export async function getStoredUser(env: Env, email: string): Promise<UserRow | null> {
	const row = await env.DB.prepare(
		"SELECT * FROM users WHERE email = ? LIMIT 1",
	)
		.bind(email.toLowerCase().trim())
		.first<UserRow>();
	return row ?? null;
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

	await env.DB.prepare(
		"INSERT INTO users (sub, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
	)
		.bind(sub, normalEmail, displayName, passwordHash, Date.now())
		.run();

	return { user: { sub, email: normalEmail, name: displayName } };
}

export async function loginUser(
	env: Env,
	email: string,
	password: string,
): Promise<{ user: AuthUser } | { error: string }> {
	const row = await getStoredUser(env, email);

	if (!row) {
		// Constant-time: don't reveal that email doesn't exist
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
