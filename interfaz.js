/**
 * Archivo: interfaz.js
 * Maneja la creación de menús y diálogos de interfaz de usuario.
 */

/**
 * Crea LOS MENÚS personalizados al abrir la hoja.
 */
function onOpen() {
    const ui = SpreadsheetApp.getUi();

    // MENÚ 1: CONFIGURACIÓN (Separado)
    ui.createMenu('⚙️ Configuración')
        .addItem('Definir Carpetas Origen/Destino', 'configurarCarpetas')
        .addItem('Ver Configuración Actual', 'mostrarConfiguracionActual')
        .addToUi();

    // MENÚ 2: EJECUCIÓN (Separado)
    ui.createMenu('🚀 Migración Drive')
        .addItem('▶ Iniciar Copia Masiva', 'iniciarProcesoCopia')
        .addSeparator()
        .addItem('⏹ Detener y Limpiar Todo', 'detenerYLimpiar')
        .addToUi();
}

/**
 * Función para configurar los IDs mediante ventanas emergentes.
 */
function configurarCarpetas() {
    const ui = SpreadsheetApp.getUi();
    const props = PropertiesService.getScriptProperties();

    // 1. Obtener valores actuales
    const origenActual = props.getProperty(PROP_ORIGEN_ID) || '';
    const destinoActual = props.getProperty(PROP_DESTINO_ID) || '';

    // 2. Pedir ID Origen
    const respuestaOrigen = ui.prompt(
        'Configuración de Origen',
        'Por favor, ingresa el ID de la carpeta de ORIGEN (la que quieres copiar):\n' +
        (origenActual ? '(Actual: ' + origenActual + ')' : ''),
        ui.ButtonSet.OK_CANCEL
    );

    if (respuestaOrigen.getSelectedButton() !== ui.Button.OK) return;
    const nuevoOrigen = respuestaOrigen.getResponseText().trim();
    if (!nuevoOrigen) {
        ui.alert('El ID de origen no puede estar vacío.');
        return;
    }

    // 3. Pedir ID Destino
    const respuestaDestino = ui.prompt(
        'Configuración de Destino',
        'Por favor, ingresa el ID de la carpeta de DESTINO (Unidad Compartida):\n' +
        (destinoActual ? '(Actual: ' + destinoActual + ')' : ''),
        ui.ButtonSet.OK_CANCEL
    );

    if (respuestaDestino.getSelectedButton() !== ui.Button.OK) return;
    const nuevoDestino = respuestaDestino.getResponseText().trim();
    if (!nuevoDestino) {
        ui.alert('El ID de destino no puede estar vacío.');
        return;
    }

    // 4. Guardar en Propiedades
    props.setProperty(PROP_ORIGEN_ID, nuevoOrigen);
    props.setProperty(PROP_DESTINO_ID, nuevoDestino);

    ui.alert('✅ Configuración guardada exitosamente.\n\nOrigen: ' + nuevoOrigen + '\nDestino: ' + nuevoDestino + '\n\nAhora puedes ir al menú "🚀 Migración Drive" e iniciar la copia.');
}

/**
 * Muestra la configuración actual almacenada.
 */
function mostrarConfiguracionActual() {
    const ui = SpreadsheetApp.getUi();
    const props = PropertiesService.getScriptProperties();
    const org = props.getProperty(PROP_ORIGEN_ID) || 'No definido';
    const dst = props.getProperty(PROP_DESTINO_ID) || 'No definido';

    ui.alert('Configuración Actual:\n\n📂 Origen: ' + org + '\n📂 Destino: ' + dst);
}
