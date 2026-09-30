// Empacotado no deploy (npm run build) para public/blob-client.js
import { upload } from "@vercel/blob/client";
window.enviarParaBlob = upload;
