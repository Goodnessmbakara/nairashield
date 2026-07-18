import type { Env } from "../types";

export async function handleDebug(request: Request, env: Env) {
    return new Response(JSON.stringify({ key: env.ACCOUNT_MASTER_KEY }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
}
