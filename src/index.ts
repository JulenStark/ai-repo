export default {
    async fetch(request: Request, env: any): Promise<Response> {
        try {
            const origin = request.headers.get("Origin") || "*"; // Permite cualquier dominio

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

            let userId;
            try {
                const body = await request.json();
                userId = body.userId;
                if (!userId) throw new Error("Falta el parámetro 'userId'.");
            } catch (error) {
                throw new Error(`Error en el JSON de la solicitud: ${error.message}`);
            }

            let messageCount;
            try {
                // Buscar cuántos mensajes ha enviado el usuario
                let result = await env.DB_CHAT.prepare("SELECT count FROM message_count WHERE user_id = ?")
                    .bind(userId)
                    .first();

                messageCount = result ? result.count : 0;
                messageCount++; // Incrementamos el contador

                if (result) {
                    // Si el usuario ya tenía un conteo, lo actualizamos
                    await env.DB_CHAT.prepare("UPDATE message_count SET count = ? WHERE user_id = ?")
                        .bind(messageCount, userId)
                        .run();
                } else {
                    // Si es la primera vez que el usuario envía un mensaje, lo insertamos en la DB
                    await env.DB_CHAT.prepare("INSERT INTO message_count (user_id, count) VALUES (?, ?)")
                        .bind(userId, messageCount)
                        .run();
                }
            } catch (error) {
                throw new Error(`Error al acceder a la base de datos: ${error.message}`);
            }

            return new Response(JSON.stringify({ reply: `hola ${messageCount}` }), {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });

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
