/**
 * @OnlyCurrentDoc
 * Script ROBUSTO para copiar recursivamente una carpeta y todo su contenido.
 * Ideal para migraciones grandes a Unidades Compartidas.
 * * CARACTERÍSTICAS:
 * - Menús separados para Configuración y Ejecución.
 * - Sistema de COLA en hoja oculta ('Copy_Queue').
 * - Ejecución automática por Triggers (bucle continuo).
 * - Prevención de duplicados e Historial persistente.
 */

// --- CONFIGURACIÓN INTERNA ---
const LOG_SHEET_NAME = 'Registro de Copia';
const QUEUE_SHEET_NAME = 'Copy_Queue';
// Mantenemos 15 minutos para seguridad.
const MAX_RUNTIME_MS = 15 * 60 * 1000; 
const TRIGGER_FUNCTION_NAME = 'processCopyQueue';

// Claves para guardar la configuración en memoria
const PROP_SOURCE_ID = 'DRIVE_COPY_SOURCE_ID';
const PROP_DEST_ID = 'DRIVE_COPY_DEST_ID';

/**
 * Crea LOS MENÚS personalizados al abrir la hoja.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // MENÚ 1: CONFIGURACIÓN (Separado)
  ui.createMenu('⚙️ Configuración')
    .addItem('Definir Carpetas Origen/Destino', 'configureFolders')
    .addItem('Ver Configuración Actual', 'showCurrentConfig')
    .addToUi();

  // MENÚ 2: EJECUCIÓN (Separado)
  ui.createMenu('🚀 Migración Drive')
    .addItem('▶ Iniciar Copia Masiva', 'startCopyProcess')
    .addSeparator()
    .addItem('⏹ Detener y Limpiar Todo', 'stopAndClear')
    .addToUi();
}

/**
 * Función para configurar los IDs mediante ventanas emergentes.
 */
function configureFolders() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  
  // 1. Obtener valores actuales
  const currentSource = props.getProperty(PROP_SOURCE_ID) || '';
  const currentDest = props.getProperty(PROP_DEST_ID) || '';

  // 2. Pedir ID Origen
  const sourceResponse = ui.prompt(
    'Configuración de Origen', 
    'Por favor, ingresa el ID de la carpeta de ORIGEN (la que quieres copiar):\n' +
    (currentSource ? '(Actual: ' + currentSource + ')' : ''),
    ui.ButtonSet.OK_CANCEL
  );
  
  if (sourceResponse.getSelectedButton() !== ui.Button.OK) return;
  const newSource = sourceResponse.getResponseText().trim();
  if (!newSource) {
    ui.alert('El ID de origen no puede estar vacío.');
    return;
  }

  // 3. Pedir ID Destino
  const destResponse = ui.prompt(
    'Configuración de Destino', 
    'Por favor, ingresa el ID de la carpeta de DESTINO (Unidad Compartida):\n' +
    (currentDest ? '(Actual: ' + currentDest + ')' : ''),
    ui.ButtonSet.OK_CANCEL
  );

  if (destResponse.getSelectedButton() !== ui.Button.OK) return;
  const newDest = destResponse.getResponseText().trim();
  if (!newDest) {
    ui.alert('El ID de destino no puede estar vacío.');
    return;
  }

  // 4. Guardar en Propiedades
  props.setProperty(PROP_SOURCE_ID, newSource);
  props.setProperty(PROP_DEST_ID, newDest);

  ui.alert('✅ Configuración guardada exitosamente.\n\nOrigen: ' + newSource + '\nDestino: ' + newDest + '\n\nAhora puedes ir al menú "🚀 Migración Drive" e iniciar la copia.');
}

/**
 * Muestra la configuración actual almacenada.
 */
function showCurrentConfig() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const src = props.getProperty(PROP_SOURCE_ID) || 'No definido';
  const dst = props.getProperty(PROP_DEST_ID) || 'No definido';
  
  ui.alert('Configuración Actual:\n\n📂 Origen: ' + src + '\n📂 Destino: ' + dst);
}

/**
 * Limpia triggers y hojas de estado.
 * @param {boolean} silent - Si es true, no muestra alertas (útil para triggers automáticos).
 */
function stopAndClear(silent) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Borrar triggers
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === TRIGGER_FUNCTION_NAME) {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  // Borrar hoja de cola
  const queueSheet = ss.getSheetByName(QUEUE_SHEET_NAME);
  if (queueSheet) ss.deleteSheet(queueSheet);
  
  // Solo mostrar alerta si NO es silencioso y hay UI
  if (!silent) {
    try {
      SpreadsheetApp.getUi().alert('Proceso detenido y cola limpiada.');
    } catch(e) {
      Logger.log("Alerta UI omitida en contexto automático.");
    }
  }
}

/**
 * Configuración inicial. Prepara la cola usando los IDs GUARDADOS EN CONFIGURACIÓN.
 */
function startCopyProcess() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();

  // 1. Limpiar ejecuciones previas (Silenciosamente)
  stopAndClear(true);

  // 2. LEER IDs DE LA CONFIGURACIÓN
  const sourceId = props.getProperty(PROP_SOURCE_ID);
  const destId = props.getProperty(PROP_DEST_ID);

  // 3. Validar
  if (!sourceId || !destId) {
    ui.alert('⚠️ FALTAN DATOS DE CONFIGURACIÓN\n\nPor favor, ve al menú "⚙️ Configuración" > "Definir Carpetas Origen/Destino" antes de iniciar.');
    return;
  }

  try {
    const sourceFolder = DriveApp.getFolderById(sourceId);
    const destFolder = DriveApp.getFolderById(destId);

    // Preparar hoja de Log (MANTENIENDO HISTORIAL)
    let logSheet = ss.getSheetByName(LOG_SHEET_NAME);
    if (!logSheet) {
      // Solo si no existe, la creamos y ponemos encabezados
      logSheet = ss.insertSheet(LOG_SHEET_NAME);
      logSheet.appendRow(['Fecha', 'Tipo', 'Nombre', 'Estado', 'URL Origen', 'URL Destino']);
      logSheet.setFrozenRows(1);
    }

    // Preparar hoja de Cola (Oculta)
    let queueSheet = ss.insertSheet(QUEUE_SHEET_NAME);
    queueSheet.hideSheet();
    queueSheet.appendRow(['SourceFolderID', 'TargetFolderID', 'Path']); // Encabezados

    // --- PASO CRUCIAL: Crear la carpeta raíz inicial ---
    ui.alert('Iniciando copia de:\n"' + sourceFolder.getName() + '"\n\nHacia:\n"' + destFolder.getName() + '"\n\nEl proceso continuará automáticamente en segundo plano.');
    
    const newRootName = sourceFolder.getName() + " (Copia)";
    // Verificar si ya existe la carpeta raíz para no duplicar en reintentos
    const existingRoots = destFolder.getFoldersByName(newRootName);
    let newRoot;
    
    // Separador visual en el log
    logSheet.appendRow(['---', '---', '---', '---', '---', '---']);
    logSheet.appendRow([new Date(), 'INICIO', 'Nueva Ejecución', 'Iniciando...', '', '']);

    if (existingRoots.hasNext()) {
      newRoot = existingRoots.next();
      logSheet.appendRow([new Date(), 'Carpeta Raíz', newRootName, 'Ya existía (Reanudando)', sourceFolder.getUrl(), newRoot.getUrl()]);
    } else {
      newRoot = destFolder.createFolder(newRootName);
      logSheet.appendRow([new Date(), 'Carpeta Raíz', newRootName, 'Creada', sourceFolder.getUrl(), newRoot.getUrl()]);
    }

    // Añadir el primer trabajo a la cola
    queueSheet.appendRow([sourceId, newRoot.getId(), newRootName]);

    // Iniciar Trigger
    scheduleNextRun();

  } catch (e) {
    ui.alert('Error al acceder a las carpetas configuradas:\n' + e.toString() + '\n\nRevisa los IDs en el menú de Configuración.');
  }
}

/**
 * Función principal del Trigger. Procesa la cola.
 */
function processCopyQueue() {
  const startTime = new Date().getTime();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const queueSheet = ss.getSheetByName(QUEUE_SHEET_NAME);
  const logSheet = ss.getSheetByName(LOG_SHEET_NAME);

  // Validaciones
  if (!queueSheet || queueSheet.getLastRow() <= 1) {
    Logger.log('Cola vacía o inexistente. Finalizando.');
    // Limpiar triggers si ya terminó (Silencioso)
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
      if (trigger.getHandlerFunction() === TRIGGER_FUNCTION_NAME) ScriptApp.deleteTrigger(trigger);
    }
    // MENSAJE FINAL PERSONALIZADO
    if (logSheet) logSheet.appendRow([new Date(), 'PROCESO', '---', 'FINALIZÓ CORRECTAMENTE LA COPIA DE TODOS LOS REGISTROS', '', '']);
    return;
  }

  // Bucle de procesamiento de la COLA
  while (queueSheet.getLastRow() > 1) {
    // Verificar tiempo antes de empezar una nueva carpeta
    if (new Date().getTime() - startTime > MAX_RUNTIME_MS) {
      Logger.log('Tiempo agotado (bucle principal). Reprogramando...');
      scheduleNextRun(); 
      return; 
    }

    // Leer el siguiente trabajo (Fila 2)
    const row = queueSheet.getRange(2, 1, 1, 3).getValues()[0];
    const sourceFolderId = row[0];
    const targetFolderId = row[1];
    const currentPath = row[2];

    try {
      const sourceFolder = DriveApp.getFolderById(sourceFolderId);
      const targetFolder = DriveApp.getFolderById(targetFolderId);

      // 1. COPIAR ARCHIVOS
      const files = sourceFolder.getFiles();
      while (files.hasNext()) {
        // Chequeo de tiempo INTRA-carpeta
        if (new Date().getTime() - startTime > MAX_RUNTIME_MS) {
          Logger.log('Tiempo agotado (copiando archivos). Reprogramando...');
          scheduleNextRun(); 
          return; // IMPORTANTE: Salimos SIN borrar la fila de la cola.
        }

        const file = files.next();
        const fileName = file.getName();

        try {
          // --- PREVENCIÓN DE DUPLICADOS ---
          // Verificar si el archivo ya existe en el destino
          const existingFiles = targetFolder.getFilesByName(fileName);
          if (existingFiles.hasNext()) {
             // Si ya existe, lo saltamos
             continue; 
          }

          // Si no existe, lo copiamos
          file.makeCopy(fileName, targetFolder);
          
        } catch (err) {
          logSheet.appendRow([new Date(), 'Archivo', fileName, 'ERROR: ' + err.message, '', '']);
        }
      }

      // 2. ENCOLAR SUBCARPETAS
      const subFolders = sourceFolder.getFolders();
      while (subFolders.hasNext()) {
        // Chequeo de tiempo INTRA-carpeta (subcarpetas)
         if (new Date().getTime() - startTime > MAX_RUNTIME_MS) {
           // Para máxima seguridad, simplemente seguimos.
         }

        const subFolder = subFolders.next();
        const subFolderName = subFolder.getName();
        
        try {
          const existingTargetFolders = targetFolder.getFoldersByName(subFolderName);
          let newTargetSub;
          
          if (existingTargetFolders.hasNext()) {
            newTargetSub = existingTargetFolders.next();
          } else {
            newTargetSub = targetFolder.createFolder(subFolderName);
            logSheet.appendRow([new Date(), 'Subcarpeta', subFolderName, 'Estructura Creada', '', '']);
          }

          queueSheet.appendRow([subFolder.getId(), newTargetSub.getId(), currentPath + "/" + subFolderName]);
          
        } catch (err) {
          logSheet.appendRow([new Date(), 'Subcarpeta', subFolderName, 'ERROR CREACIÓN', '', '']);
        }
      }

      // Éxito: Borrar esta tarea de la cola.
      queueSheet.deleteRow(2);

    } catch (e) {
      logSheet.appendRow([new Date(), 'Carpeta', currentPath, 'ERROR CRÍTICO ACCESO: ' + e.message, '', '']);
      // Si la carpeta es inaccesible, la borramos de la cola para no bloquear el proceso infinito
      queueSheet.deleteRow(2); 
    }
  }

  // Si salimos del while, la cola está vacía
  Logger.log('Cola finalizada.');
  stopAndClear(true); // Limpieza final SILENCIOSA
  // MENSAJE FINAL PERSONALIZADO
  logSheet.appendRow([new Date(), 'PROCESO', '---', 'FINALIZÓ CORRECTAMENTE LA COPIA DE TODOS LOS REGISTROS', '', '']);
  
  // Opcional: Enviar correo
  try {
     MailApp.sendEmail(Session.getActiveUser().getEmail(), "Copia de Drive Finalizada", "FINALIZÓ CORRECTAMENTE LA COPIA DE TODOS LOS REGISTROS");
  } catch(e) {}
}

function scheduleNextRun() {
  // Borrar triggers anteriores
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
     if (trigger.getHandlerFunction() === TRIGGER_FUNCTION_NAME) ScriptApp.deleteTrigger(trigger);
  }
  // Nuevo trigger
  ScriptApp.newTrigger(TRIGGER_FUNCTION_NAME)
    .timeBased()
    // 1 minutos de descanso para evitar error 360ms
    .after(1 * 60 * 1000) 
    .create();
}