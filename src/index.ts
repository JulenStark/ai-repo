// 📌 Código para el Worker en Cloudflare (`index.ts`)
// ✅ Maneja la comunicación con OpenAI y devuelve respuestas al chat

export default {
    async fetch(request: Request, env: any): Promise<Response> {
        try {
            // 🔹 Asegurar que la solicitud es POST
            if (request.method !== "POST") {
                return new Response("❌ Método no permitido", { status: 405 });
            }

            // 🔹 Obtener datos de la solicitud
            const { userId, message } = await request.json();
            if (!userId || !message) {
                throw new Error("Faltan parámetros en la solicitud.");
            }

            // 🔹 Configurar credenciales de OpenAI (Definidas en Cloudflare)
            const OPENAI_API_KEY = env.OPENAI_API_KEY; // 🔄 Cambiar en Cloudflare si es necesario
            const ASSISTANT_ID = env.ASSISTANT_ID; // 🔄 Cambiar en Cloudflare si es necesario

            if (!OPENAI_API_KEY || !ASSISTANT_ID) {
                throw new Error("❌ ERROR: Las variables de entorno OPENAI_API_KEY o ASSISTANT_ID no están configuradas.");
            }

            // 🔹 Crear un nuevo Thread en OpenAI (SIN historial)
            const threadResponse = await fetch("https://api.openai.com/v1/threads", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json"
                }
            });

            if (!threadResponse.ok) {
                const errorMsg = await threadResponse.text();
                throw new Error(`Error al crear thread en OpenAI: ${errorMsg}`);
            }

            const threadData = await threadResponse.json();
            const threadId = threadData.id;

            // 🔹 Enviar el mensaje al Thread recién creado
            await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ role: "user", content: message })
            });

            // 🔹 Ejecutar el asistente para obtener la respuesta
            await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ assistant_id: ASSISTANT_ID })
            });

            // 🔹 Obtener la respuesta de OpenAI
            const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }
            });
            
            const data = await response.json();
            const reply = data.data[data.data.length - 1].content;

            // 🔹 Enviar respuesta de vuelta al frontend (WordPress)
            return new Response(JSON.stringify({ reply }), {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });

        } catch (error: any) {
            // 🔹 Capturar cualquier error y devolver un mensaje claro
            return new Response(
                JSON.stringify({ error: "❌ Error interno en el Worker", message: error.message }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                }
            );
        }
    }
};
