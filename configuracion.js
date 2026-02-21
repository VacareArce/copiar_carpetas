/**
 * @OnlyCurrentDoc
 * Archivo: configuracion.js
 * Contiene todas las constantes y configuraciones globales para el script de copia.
 */

// --- CONFIGURACIÓN INTERNA ---
const HOJA_REGISTRO = 'Registro de Copia';
const HOJA_COLA = 'Copy_Queue';
// Mantenemos 15 minutos para seguridad.
const TIEMPO_MAXIMO_MS = 15 * 60 * 1000;
const FUNCION_GATILLO = 'procesarColaDeCopia';

// Claves para guardar la configuración en memoria
const PROP_ORIGEN_ID = 'DRIVE_COPY_SOURCE_ID';
const PROP_DESTINO_ID = 'DRIVE_COPY_DEST_ID';

/**
 * Función utilitaria para extraer el ID de la carpeta de Drive a partir de una URL completa.
 * Si recibe solo el ID directamente, lo devuelve igual.
 * @param {string} entrada - La URL o el ID de la carpeta
 * @returns {string} El ID extraído y limpio
 */
function extraerIdDeUrl(entrada) {
    if (!entrada) return '';
    entrada = entrada.trim();

    // Buscar un patrón clásico de ID de Google Drive (suelen ser de ~33 caracteres alfanuméricos)
    // ej: https://drive.google.com/drive/folders/1A2b3C-4d...
    const match = entrada.match(/[-\w]{25,}/);

    return match ? match[0] : entrada;
}
