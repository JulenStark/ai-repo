export default {
    async fetch(request: Request, env: any): Promise<Response> {
        const allowedOrigins = ["https://algimnasio.com"]; // 🔒 Solo permite solicitudes desde este dominio
        const origin = request.headers.get("Origin");

        if (!origin || !allowedOrigins.includes(origin)) {
            return new Response("❌ Acceso no autorizado", {
                status: 403,
                headers: { "Access-Control-Allow-Origin": "https://algimnasio.com" }
            });
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
            try {
                const { userId, message } = await request.json();
                const OPENAI_API_KEY = env.OPENAI_API_KEY;
                const ASSISTANT_ID = env.ASSISTANT_ID;

                // 🔍 Buscar thread en D1 Database
                let threadResult = await env.DB_CHAT.prepare("SELECT id FROM threads WHERE user_id = ?")
                    .bind(userId)
                    .first();

                let threadId = threadResult ? threadResult.id : null;

                if (!threadId) {
                    // 🆕 Crear un nuevo thread en OpenAI si no existe
                    const threadResponse = await fetch("https://api.openai.com/v1/threads", {
                        method: "POST",
                        headers: { 
                            "Authorization": `Bearer ${OPENAI_API_KEY}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ assistant_id: ASSISTANT_ID })
                    });

                    const threadData = await threadResponse.json();
                    threadId = threadData.id;

                    // 📌 Guardar el nuevo thread en D1 Database
                    await env.DB_CHAT.prepare("INSERT INTO threads (id, user_id, messages) VALUES (?, ?, ?)")
                        .bind(threadId, userId, "[]")
                        .run();
                }

                // 📩 Enviar mensaje al asistente en OpenAI
                const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                    method: "POST",
                    headers: { 
                        "Authorization": `Bearer ${OPENAI_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ role: "user", content: message })
                });

                const responseData = await response.json();

                // 📌 Guardar la conversación en la base de datos
                let messagesData = JSON.stringify([{ role: "user", content: message }]);
                await env.DB_CHAT.prepare("UPDATE threads SET messages = ? WHERE id = ?")
                    .bind(messagesData, threadId)
                    .run();

                // 📩 Responder con el mensaje del asistente
                return new Response(JSON.stringify({ reply: responseData.choices[0].message.content }), {
                    headers: { 
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": origin
                    }
                });

            } catch (error: any) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { 
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "https://algimnasio.com"
                    }
                });
            }
        }
        
        // ⛔ Si no es un POST, devolver error
        return new Response("❌ Método no permitido", { 
            status: 405,
            headers: { "Access-Control-Allow-Origin": "https://algimnasio.com" }
        });
    }
};
