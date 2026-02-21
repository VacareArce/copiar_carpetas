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
