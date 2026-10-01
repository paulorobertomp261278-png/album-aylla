// Empacotado no deploy (npm run build) para public/blob-client.js
import { uploadPresigned } from "@vercel/blob/client";
window.enviarParaBlob = uploadPresigned;
