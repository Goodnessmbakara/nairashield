import { getDb } from "../db/client";
import type { Env } from "../types";

export type UserProfile = {
	userSub: string;
	firstName: string;
	lastName: string;
	email: string;
	mobileNumber: string;
	dob: string;
	address: string;
	city: string;
	country: string;
	createdAt: number;
	updatedAt: number;
};

export type ProfileInput = {
	firstName: string;
	lastName: string;
	email: string;
	mobileNumber: string;
	dob: string;
	address: string;
	city: string;
	country: string;
};

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateProfileInput(raw: Partial<ProfileInput>): ProfileInput | string {
	const firstName = (raw.firstName || "").trim();
	const lastName = (raw.lastName || "").trim();
	const email = (raw.email || "").trim().toLowerCase();
	const mobileNumber = (raw.mobileNumber || "").trim();
	const dob = (raw.dob || "").trim();
	const address = (raw.address || "").trim();
	const city = (raw.city || "").trim();
	const country = (raw.country || "").trim();

	if (!firstName) return "firstName is required";
	if (!lastName) return "lastName is required";
	if (!email || !email.includes("@")) return "valid email is required";
	if (!mobileNumber || mobileNumber.length < 8) return "mobileNumber is required";
	if (!DOB_RE.test(dob)) return "dob must be YYYY-MM-DD";
	if (!address) return "address is required";
	if (!city) return "city is required";
	if (!country) return "country is required";

	return {
		firstName,
		lastName,
		email,
		mobileNumber,
		dob,
		address,
		city,
		country,
	};
}

export async function getProfile(env: Env, userSub: string): Promise<UserProfile | null> {
	const sql = getDb(env);
	const rows = await sql`SELECT * FROM user_profiles WHERE user_sub = ${userSub} LIMIT 1`;
	return rows[0] ? rowToProfile(rows[0]) : null;
}

export async function upsertProfile(
	env: Env,
	userSub: string,
	input: ProfileInput,
): Promise<UserProfile> {
	const sql = getDb(env);
	const now = Date.now();
	await sql`
		INSERT INTO user_profiles (
			user_sub, first_name, last_name, email, mobile_number,
			dob, address, city, country, created_at, updated_at
		) VALUES (
			${userSub}, ${input.firstName}, ${input.lastName}, ${input.email},
			${input.mobileNumber}, ${input.dob}, ${input.address}, ${input.city},
			${input.country}, ${now}, ${now}
		)
		ON CONFLICT (user_sub) DO UPDATE SET
			first_name = EXCLUDED.first_name,
			last_name = EXCLUDED.last_name,
			email = EXCLUDED.email,
			mobile_number = EXCLUDED.mobile_number,
			dob = EXCLUDED.dob,
			address = EXCLUDED.address,
			city = EXCLUDED.city,
			country = EXCLUDED.country,
			updated_at = EXCLUDED.updated_at
	`;
	const profile = await getProfile(env, userSub);
	if (!profile) throw new Error("Failed to persist profile");
	return profile;
}

function rowToProfile(row: Record<string, unknown>): UserProfile {
	return {
		userSub: row.user_sub as string,
		firstName: row.first_name as string,
		lastName: row.last_name as string,
		email: row.email as string,
		mobileNumber: row.mobile_number as string,
		dob: row.dob as string,
		address: row.address as string,
		city: row.city as string,
		country: row.country as string,
		createdAt: Number(row.created_at),
		updatedAt: Number(row.updated_at),
	};
}
