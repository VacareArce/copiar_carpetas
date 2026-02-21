/**
 * Archivo: motor.js
 * Contiene la lógica principal de copiado, el encolado y los temporizadores (triggers).
 */

/**
 * Limpia triggers y hojas de estado.
 * @param {boolean} silencioso - Si es true, no muestra alertas (útil para triggers automáticos).
 */
function detenerYLimpiar(silencioso) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Borrar triggers
    const disparadores = ScriptApp.getProjectTriggers();
    for (const disparador of disparadores) {
        if (disparador.getHandlerFunction() === FUNCION_GATILLO) {
            ScriptApp.deleteTrigger(disparador);
        }
    }

    // Borrar hoja de cola
    const hojaCola = ss.getSheetByName(HOJA_COLA);
    if (hojaCola) ss.deleteSheet(hojaCola);

    // Solo mostrar alerta si NO es silencioso y hay UI
    if (!silencioso) {
        try {
            SpreadsheetApp.getUi().alert('Proceso detenido y cola limpiada.');
        } catch (e) {
            Logger.log("Alerta UI omitida en contexto automático.");
        }
    }
}

/**
 * Configuración inicial. Prepara la cola usando los IDs GUARDADOS EN CONFIGURACIÓN.
 */
function iniciarProcesoCopia() {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const props = PropertiesService.getScriptProperties();

    // 1. Limpiar ejecuciones previas (Silenciosamente)
    detenerYLimpiar(true);

    // 2. LEER IDs DE LA CONFIGURACIÓN
    const idOrigen = props.getProperty(PROP_ORIGEN_ID);
    const idDestino = props.getProperty(PROP_DESTINO_ID);

    // 3. Validar
    if (!idOrigen || !idDestino) {
        ui.alert('⚠️ FALTAN DATOS DE CONFIGURACIÓN\n\nPor favor, ve al menú "⚙️ Configuración" > "Definir Carpetas Origen/Destino" antes de iniciar.');
        return;
    }

    try {
        const carpetaOrigen = DriveApp.getFolderById(idOrigen);
        const carpetaDestino = DriveApp.getFolderById(idDestino);

        // Preparar hoja de Log (MANTENIENDO HISTORIAL)
        let hojaRegistro = ss.getSheetByName(HOJA_REGISTRO);
        if (!hojaRegistro) {
            // Solo si no existe, la creamos y ponemos encabezados
            hojaRegistro = ss.insertSheet(HOJA_REGISTRO);
            hojaRegistro.appendRow(['Fecha', 'Tipo', 'Nombre', 'Estado', 'URL Origen', 'URL Destino']);
            hojaRegistro.setFrozenRows(1);
        }

        // Preparar hoja de Cola (Oculta)
        let hojaCola = ss.insertSheet(HOJA_COLA);
        hojaCola.hideSheet();
        hojaCola.appendRow(['IdCarpetaOrigen', 'IdCarpetaDestino', 'Ruta']); // Encabezados

        // --- PASO CRUCIAL: Crear la carpeta raíz inicial ---
        ui.alert('Iniciando copia de:\n"' + carpetaOrigen.getName() + '"\n\nHacia:\n"' + carpetaDestino.getName() + '"\n\nEl proceso continuará automáticamente en segundo plano.');

        const nombreNuevaRaiz = carpetaOrigen.getName() + " (Copia)";
        // Verificar si ya existe la carpeta raíz para no duplicar en reintentos
        const raicesExistentes = carpetaDestino.getFoldersByName(nombreNuevaRaiz);
        let nuevaRaiz;

        // Separador visual en el log
        hojaRegistro.appendRow(['---', '---', '---', '---', '---', '---']);
        hojaRegistro.appendRow([new Date(), 'INICIO', 'Nueva Ejecución', 'Iniciando...', '', '']);

        if (raicesExistentes.hasNext()) {
            nuevaRaiz = raicesExistentes.next();
            hojaRegistro.appendRow([new Date(), 'Carpeta Raíz', nombreNuevaRaiz, 'Ya existía (Reanudando)', carpetaOrigen.getUrl(), nuevaRaiz.getUrl()]);
        } else {
            nuevaRaiz = carpetaDestino.createFolder(nombreNuevaRaiz);
            hojaRegistro.appendRow([new Date(), 'Carpeta Raíz', nombreNuevaRaiz, 'Creada', carpetaOrigen.getUrl(), nuevaRaiz.getUrl()]);
        }

        // Añadir el primer trabajo a la cola
        hojaCola.appendRow([idOrigen, nuevaRaiz.getId(), nombreNuevaRaiz]);

        // Iniciar Trigger
        programarSiguienteEjecucion();

    } catch (e) {
        ui.alert('Error al acceder a las carpetas configuradas:\n' + e.toString() + '\n\nRevisa los IDs en el menú de Configuración.');
    }
}

/**
 * Función principal del Trigger. Procesa la cola.
 */
function procesarColaDeCopia() {
    const tiempoInicio = new Date().getTime();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaCola = ss.getSheetByName(HOJA_COLA);
    const hojaRegistro = ss.getSheetByName(HOJA_REGISTRO);

    // Validaciones
    if (!hojaCola || hojaCola.getLastRow() <= 1) {
        Logger.log('Cola vacía o inexistente. Finalizando.');
        // Limpiar triggers si ya terminó (Silencioso)
        const disparadores = ScriptApp.getProjectTriggers();
        for (const disparador of disparadores) {
            if (disparador.getHandlerFunction() === FUNCION_GATILLO) ScriptApp.deleteTrigger(disparador);
        }
        // MENSAJE FINAL PERSONALIZADO
        if (hojaRegistro) hojaRegistro.appendRow([new Date(), 'PROCESO', '---', 'FINALIZÓ CORRECTAMENTE LA COPIA DE TODOS LOS REGISTROS', '', '']);
        return;
    }

    // Bucle de procesamiento de la COLA
    while (hojaCola.getLastRow() > 1) {
        // Verificar tiempo antes de empezar una nueva carpeta
        if (new Date().getTime() - tiempoInicio > TIEMPO_MAXIMO_MS) {
            Logger.log('Tiempo agotado (bucle principal). Reprogramando...');
            programarSiguienteEjecucion();
            return;
        }

        // Leer el siguiente trabajo (Fila 2)
        const fila = hojaCola.getRange(2, 1, 1, 3).getValues()[0];
        const idCarpetaOrigen = fila[0];
        const idCarpetaDestino = fila[1];
        const rutaActual = fila[2];

        try {
            const carpetaOrigen = DriveApp.getFolderById(idCarpetaOrigen);
            const carpetaDestino = DriveApp.getFolderById(idCarpetaDestino);

            // 1. COPIAR ARCHIVOS
            const archivos = carpetaOrigen.getFiles();
            while (archivos.hasNext()) {
                // Chequeo de tiempo INTRA-carpeta
                if (new Date().getTime() - tiempoInicio > TIEMPO_MAXIMO_MS) {
                    Logger.log('Tiempo agotado (copiando archivos). Reprogramando...');
                    programarSiguienteEjecucion();
                    return; // IMPORTANTE: Salimos SIN borrar la fila de la cola.
                }

                const archivo = archivos.next();
                const nombreArchivo = archivo.getName();

                try {
                    // --- PREVENCIÓN DE DUPLICADOS ---
                    // Verificar si el archivo ya existe en el destino
                    const archivosExistentes = carpetaDestino.getFilesByName(nombreArchivo);
                    if (archivosExistentes.hasNext()) {
                        // Si ya existe, lo saltamos
                        continue;
                    }

                    // Si no existe, lo copiamos
                    archivo.makeCopy(nombreArchivo, carpetaDestino);

                } catch (err) {
                    hojaRegistro.appendRow([new Date(), 'Archivo', nombreArchivo, 'ERROR: ' + err.message, '', '']);
                }
            }

            // 2. ENCOLAR SUBCARPETAS
            const subcarpetas = carpetaOrigen.getFolders();
            while (subcarpetas.hasNext()) {
                // Chequeo de tiempo INTRA-carpeta (subcarpetas)
                if (new Date().getTime() - tiempoInicio > TIEMPO_MAXIMO_MS) {
                    // Para máxima seguridad, simplemente seguimos.
                }

                const subcarpeta = subcarpetas.next();
                const nombreSubcarpeta = subcarpeta.getName();

                try {
                    const subcarpetasDestinoExistentes = carpetaDestino.getFoldersByName(nombreSubcarpeta);
                    let nuevaSubDestino;

                    if (subcarpetasDestinoExistentes.hasNext()) {
                        nuevaSubDestino = subcarpetasDestinoExistentes.next();
                    } else {
                        nuevaSubDestino = carpetaDestino.createFolder(nombreSubcarpeta);
                        hojaRegistro.appendRow([new Date(), 'Subcarpeta', nombreSubcarpeta, 'Estructura Creada', '', '']);
                    }

                    hojaCola.appendRow([subcarpeta.getId(), nuevaSubDestino.getId(), rutaActual + "/" + nombreSubcarpeta]);

                } catch (err) {
                    hojaRegistro.appendRow([new Date(), 'Subcarpeta', nombreSubcarpeta, 'ERROR CREACIÓN', '', '']);
                }
            }

            // Éxito: Borrar esta tarea de la cola.
            hojaCola.deleteRow(2);

        } catch (e) {
            hojaRegistro.appendRow([new Date(), 'Carpeta', rutaActual, 'ERROR CRÍTICO ACCESO: ' + e.message, '', '']);
            // Si la carpeta es inaccesible, la borramos de la cola para no bloquear el proceso infinito
            hojaCola.deleteRow(2);
        }
    }

    // Si salimos del while, la cola está vacía
    Logger.log('Cola finalizada.');
    detenerYLimpiar(true); // Limpieza final SILENCIOSA
    // MENSAJE FINAL PERSONALIZADO
    hojaRegistro.appendRow([new Date(), 'PROCESO', '---', 'FINALIZÓ CORRECTAMENTE LA COPIA DE TODOS LOS REGISTROS', '', '']);

    // Opcional: Enviar correo
    try {
        MailApp.sendEmail(Session.getActiveUser().getEmail(), "Copia de Drive Finalizada", "FINALIZÓ CORRECTAMENTE LA COPIA DE TODOS LOS REGISTROS");
    } catch (e) { }
}

function programarSiguienteEjecucion() {
    // Borrar triggers anteriores
    const disparadores = ScriptApp.getProjectTriggers();
    for (const disparador of disparadores) {
        if (disparador.getHandlerFunction() === FUNCION_GATILLO) ScriptApp.deleteTrigger(disparador);
    }
    // Nuevo trigger
    ScriptApp.newTrigger(FUNCION_GATILLO)
        .timeBased()
        // 1 minutos de descanso para evitar error 360ms
        .after(1 * 60 * 1000)
        .create();
}
