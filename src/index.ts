export default {
    async fetch(request: Request, env: any): Promise<Response> {
        try {
            const origin = request.headers.get("Origin") || "*"; // Permite cualquier origen

            // Manejo de CORS
            if (request.method === "OPTIONS") {
                return new Response(null, {
                    headers: {
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "POST, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type"
                    }
                });
            }

            if (request.method !== "POST") {
                throw new Error("Método no permitido. Solo se aceptan solicitudes POST.");
            }

            let userId, message;
            try {
                const body = await request.json();
                userId = body.userId;
                message = body.message;
                if (!userId || !message) throw new Error("Faltan parámetros en la solicitud.");
            } catch (error) {
                throw new Error(`Error en el JSON de la solicitud: ${error.message}`);
            }

            // Validar variables de entorno
            const OPENAI_API_KEY = env.OPENAI_API_KEY;
            const ASSISTANT_ID = env.ASSISTANT_ID;
            if (!OPENAI_API_KEY || !ASSISTANT_ID) {
                throw new Error("Las variables de entorno OPENAI_API_KEY o ASSISTANT_ID no están configuradas.");
            }

            let threadId;
            try {
                let threadResult = await env.DB_CHAT.prepare("SELECT id FROM threads WHERE user_id = ?")
                    .bind(userId)
                    .first();
                threadId = threadResult ? threadResult.id : null;
            } catch (error) {
                throw new Error(`Error al acceder a la base de datos: ${error.message}`);
            }

            if (!threadId) {
                try {
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
                        throw new Error(`Error en OpenAI al crear el thread: ${errorMsg}`);
                    }

                    const threadData = await threadResponse.json();
                    threadId = threadData.id;

                    await env.DB_CHAT.prepare("INSERT INTO threads (id, user_id, messages) VALUES (?, ?, ?)")
                        .bind(threadId, userId, "[]")
                        .run();
                } catch (error) {
                    throw new Error(`Error al crear thread en OpenAI: ${error.message}`);
                }
            }

            try {
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
                    throw new Error(`Error en OpenAI al responder el mensaje: ${errorMsg}`);
                }

                const responseData = await response.json();
                let messagesData = JSON.stringify([{ role: "user", content: message }]);

                await env.DB_CHAT.prepare("UPDATE threads SET messages = ? WHERE id = ?")
                    .bind(messagesData, threadId)
                    .run();

                return new Response(JSON.stringify({ reply: responseData.choices[0].message.content }), {
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });

            } catch (error) {
                throw new Error(`Error en la comunicación con OpenAI: ${error.message}`);
            }

        } catch (error: any) {
            return new Response(
                JSON.stringify({
                    error: "❌ Error interno en el Worker",
                    message: error.message,
                    stack: error.stack
                }), 
                {
                    status: 500,
                    headers: { 
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    }
                }
            );
        }
    }
};
