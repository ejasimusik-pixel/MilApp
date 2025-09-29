// server.js - El mini-servidor para Glitch
require('dotenv').config(); // Carga las variables de entorno desde el archivo .env
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' })); // Aumentar límite para imágenes
app.use(express.static('public')); // Servir archivos estáticos

// Clave de API (se debe configurar en Glitch como una variable de entorno)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn("Advertencia: La variable de entorno GEMINI_API_KEY no está configurada.");
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Endpoint para peticiones de texto
app.post('/api/gemini', async (req, res) => {
  try {
    const { prompt, expectJson } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    if (expectJson) {
      // Gemini a veces envuelve el JSON en ```json ... ```
      const cleanedText = text.replace(/```json\n?|```/g, '').trim();
      res.json(JSON.parse(cleanedText));
    } else {
      res.json({ text });
    }
  } catch (error) {
    console.error('Error en /api/gemini:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud de texto.' });
  }
});

// Endpoint para generación de imágenes
app.post('/api/gemini/generate-image', async (req, res) => {
  try {
    const { prompt, refImages } = req.body; // refImages es un array de strings base64
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

    const promptParts = [prompt];
    
    if (refImages && refImages.length > 0) {
      refImages.forEach(base64Image => {
        // El cliente ahora envía el objeto completo, no solo el base64
        promptParts.push(base64Image);
      });
    }

    // Mensaje de depuración para ver qué está llegando
    console.log(`Recibida petición para generar imagen con ${promptParts.length - 1} imágenes de referencia.`);
    console.log(`Prompt: ${prompt}`);
    
    const result = await model.generateContent(promptParts);
    const response = await result.response;
    const text = response.text();

    // La respuesta de Vision para generar imágenes es el prompt para otro modelo.
    // Esto es un placeholder. Para una generación real, necesitaríamos otro paso.
    // Por ahora, devolvemos un texto que indica que la función no está completa.
    // Para simular, vamos a devolver una imagen de placeholder.
    // La respuesta de Vision es un prompt mejorado, que usamos para el placeholder.
    const placeholderUrl = `https://via.placeholder.com/512x512.png?text=${encodeURIComponent(text.substring(0, 50))}...`;
    
    // Devolvemos la URL de la imagen de placeholder
    res.json({ imageDataUrl: placeholderUrl });

  } catch (error) {
    console.error('Error en /api/gemini/generate-image:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud de imagen.' });
  }
});


// Servir el index.html en la ruta raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar el servidor
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Tu app está escuchando en el puerto ' + listener.address().port);
});
