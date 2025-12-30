
import fs from 'fs';
import path from 'path';

// --- ENV LOADING ---
try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const file = fs.readFileSync(envPath, 'utf8');
        file.split('\n').forEach(line => {
            const idx = line.indexOf('=');
            if (idx > 0 && !line.trim().startsWith('#')) {
                const key = line.substring(0, idx).trim();
                let val = line.substring(idx + 1).trim();
                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                process.env[key] = val;
            }
        });
        console.log("✅ Loaded .env file manually from scripts/env-loader");
    } else {
        console.warn("⚠️ No .env file found at", envPath);
    }
} catch (e) {
    console.warn("Failed to load .env file manually", e);
}
