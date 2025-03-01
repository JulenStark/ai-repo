export default {
    async fetch(request: Request, env: any): Promise<Response> {
        try {
            const allowedOrigins = ["https://algimnasio.com"];
            const origin = request.headers.get("Origin");

            if (!origin || !allowedOrigins.includes(origin)) {
                return new Response("❌ Acceso no autorizado", { status: 403 });
            }

            const { method } = request;

            if (method === "OPTIONS") {
                return new Response(null, {
                    headers: {
                        "Access-Control-Allow-Origin": origin,
                        "Access-Control-Allow-Methods": "POST, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type"
                    }
                });
            }

            if (method === "POST") {
                const { userId, message } = await request.json();
                if (!userId || !message) throw new Error("Faltan parámetros en la solicitud.");

                const OPENAI_API_KEY = env.OPENAI_API_KEY;
                const ASSISTANT_ID = env.ASSISTANT_ID;

                if (!OPENAI_API_KEY || !ASSISTANT_ID) {
                    throw new Error("❌ ERROR: Las variables de entorno no están configuradas.");
                }

                let threadResult = await env.DB_CHAT.prepare("SELECT id FROM threads WHERE user_id = ?")
                    .bind(userId)
                    .first();

                let threadId = threadResult ? threadResult.id : null;

                if (!threadId) {
                    const threadResponse = await fetch("https://api.openai.com/v1/threads", {
                        method: "POST",
                        headers: { 
                            "Authorization": `Bearer ${OPENAI_API_KEY}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ assistant_id: ASSISTANT_ID })
                    });

                    if (!threadResponse.ok) {
                        const errorMsg = await threadResponse.text();
                        throw new Error(`Error al crear el thread en OpenAI: ${errorMsg}`);
                    }

                    const threadData = await threadResponse.json();
                    threadId = threadData.id;

                    await env.DB_CHAT.prepare("INSERT INTO threads (id, user_id, messages) VALUES (?, ?, ?)")
                        .bind(threadId, userId, "[]")
                        .run();
                }

                const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                    method: "POST",
                    headers: { 
                        "Authorization": `Bearer ${OPENAI_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ role: "user", content: message })
                });

                if (!response.ok) {
                    const errorMsg = await response.text();
                    throw new Error(`Error en la respuesta de OpenAI: ${errorMsg}`);
                }

                const responseData = await response.json();
                let messagesData = JSON.stringify([{ role: "user", content: message }]);

                await env.DB_CHAT.prepare("UPDATE threads SET messages = ? WHERE id = ?")
                    .bind(messagesData, threadId)
                    .run();

                return new Response(JSON.stringify({ reply: responseData.choices[0].message.content }), {
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin }
                });
            }

            return new Response("❌ Método no permitido", { status: 405 });

        } catch (error: any) {
            return new Response(`❌ Error interno: ${error.message}`, { status: 500 });
        }
    }
};
