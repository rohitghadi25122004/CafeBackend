import "dotenv/config";
import { app } from "./app.js";
async function start() {
    try {
        await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
        console.log("Server is running on port 3000 (accessible via LAN)");


    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
start();