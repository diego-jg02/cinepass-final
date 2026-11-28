// Descripción en lenguaje natural de cada caso de prueba, para el informe Word (generar-informe.js).
// Está escrita a partir de lo que hace el código de cada *.spec.js. Si cambias una prueba, actualiza aquí su texto.
// Notas comunes:
//  - Cada prueba empieza con el navegador limpio (sin datos guardados).
//  - "Comprar" (función comprar() de utilidades.js) = abrir "La hora del vidrio", elegir la primera función de mañana,
//    llevar los boletos General a 2, elegir los 2 primeros asientos libres, continuar al pago y pagar con la tarjeta de prueba 4111 1111 1111 1111.
//  - "Registrarse" (registrarse()) = crear una cuenta nueva con un correo único y la contraseña Clave#2026; la sesión queda iniciada.

module.exports = {
  'CP-01': {
    objetivo: 'Comprobar que la página de inicio carga y que la cartelera muestra todas las películas disponibles.',
    pasos: [
      'Abrir la página de inicio de CinePass.',
      'Verificar que se ve la película destacada en la parte superior.',
      'Bajar hasta la sección Cartelera y contar las películas.',
    ],
    esperado: 'Se ve la película destacada y la cartelera muestra 8 películas con el texto "8 películas disponibles".',
  },
  'CP-02': {
    objetivo: 'Comprobar que la búsqueda filtra las películas en tiempo real mientras el usuario escribe.',
    pasos: [
      'Abrir la página Cartelera y desplegar los filtros.',
      'Escribir "terror" en el buscador, sin presionar Enter.',
    ],
    esperado: 'Queda solo 1 película, "Casa sin ventanas", y el contador dice 1 resultado para "terror".',
  },
  'CP-03': {
    objetivo: 'Comprobar que una búsqueda sin coincidencias muestra un mensaje claro y que se puede limpiar.',
    pasos: [
      'Abrir la página Cartelera y desplegar los filtros.',
      'Escribir "zzzz pelicula inexistente" en el buscador.',
      'Pulsar "Ver toda la cartelera" para limpiar la búsqueda.',
    ],
    esperado: 'Aparece el mensaje "No encontramos películas" y, al limpiar, vuelven a mostrarse las 8 películas.',
  },
  'CP-04': {
    objetivo: 'Comprobar que el filtro por género muestra solo las películas de ese género.',
    pasos: [
      'Abrir la página Cartelera y desplegar los filtros.',
      'Elegir el género "Animación".',
    ],
    esperado: 'Queda solo "El jardín de Ana" y el filtro "Animación" aparece como etiqueta activa.',
  },
  'CP-05': {
    objetivo: 'Comprobar que el detalle de una película muestra su ficha técnica y las funciones del día elegido.',
    pasos: [
      'Abrir el detalle de "Nocturno en Colón".',
      'Revisar el título y la ficha técnica.',
      'Elegir el día de mañana.',
    ],
    esperado: 'El título es "Nocturno en Colón", la ficha dice Suspenso y 104 min, y para mañana hay 3 funciones.',
  },
  'CP-06': {
    objetivo: 'Comprobar que una dirección que no existe muestra una página de error amigable.',
    pasos: ['Abrir la dirección #/esta-ruta-no-existe.'],
    esperado: 'Se muestra la página de error 404 con el título "Esta sala no existe".',
  },
  'CP-07': {
    objetivo: 'Comprobar que el registro rechaza un correo inválido, una contraseña débil y una confirmación distinta.',
    pasos: [
      'Abrir el formulario de registro.',
      'Escribir el nombre "Ana", el correo "correo-sin-arroba", la contraseña "abc" y la confirmación "xyz".',
      'Aceptar los términos y pulsar Registrarme.',
    ],
    esperado: 'Aparecen tres errores: el correo no es válido, la contraseña debe tener al menos 8 caracteres y "Las contraseñas no coinciden."',
  },
  'CP-08': {
    objetivo: 'Comprobar que el indicador marca cada requisito de la contraseña y que un registro válido inicia sesión.',
    pasos: [
      'Abrir el formulario de registro y verificar que el botón está desactivado mientras no se aceptan los términos.',
      'Escribir el nombre "Carlos Pérez", un correo nuevo, el teléfono 6123-4567 y la contraseña "Cine#2026".',
      'Revisar los 5 requisitos del indicador: largo, mayúscula, minúscula, número y símbolo.',
      'Repetir la contraseña, aceptar los términos y pulsar Registrarme.',
    ],
    esperado: 'Los 5 requisitos se marcan como cumplidos y, al registrarse, el menú muestra "Carlos" con la opción de cerrar sesión.',
  },
  'CP-09': {
    objetivo: 'Comprobar que no se puede crear una cuenta con un correo que ya está registrado.',
    pasos: [
      'Abrir el formulario de registro.',
      'Llenarlo con el correo de la cuenta demo (demo@cinepass.test) y una contraseña válida.',
      'Aceptar los términos y pulsar Registrarme.',
    ],
    esperado: 'Aparece el mensaje "Este correo ya está registrado. Por favor inicia sesión."',
  },
  'CP-10': {
    objetivo: 'Comprobar que iniciar sesión con una contraseña incorrecta muestra un error y no da acceso.',
    pasos: [
      'Abrir la página de inicio de sesión.',
      'Escribir el correo de la cuenta demo con una contraseña equivocada y pulsar Entrar.',
    ],
    esperado: 'Aparece "Correo o contraseña incorrectos." y no se inicia sesión.',
  },
  'CP-11': {
    objetivo: 'Comprobar que la cuenta se bloquea temporalmente después de 5 intentos fallidos.',
    pasos: [
      'Abrir la página de inicio de sesión con el correo de la cuenta demo.',
      'Intentar entrar 5 veces con contraseñas incorrectas.',
      'Intentar entrar una vez más con la contraseña correcta.',
    ],
    esperado: 'Ni con la contraseña correcta se puede entrar: aparece "Cuenta bloqueada temporalmente".',
  },
  'CP-12': {
    objetivo: 'Comprobar que un inicio de sesión correcto muestra el nombre del usuario y que se puede cerrar sesión.',
    pasos: [
      'Abrir la página de inicio de sesión.',
      'Escribir el correo y la contraseña de la cuenta demo y pulsar Entrar.',
      'Pulsar Salir.',
    ],
    esperado: 'Tras entrar, el menú muestra "Cliente". Tras salir, vuelve a aparecer "Iniciar sesión".',
  },
  'CP-13': {
    objetivo: 'Comprobar el flujo completo de compra con tarjeta, desde los boletos hasta el comprobante.',
    pasos: [
      'Iniciar sesión con la cuenta demo.',
      'Abrir "La hora del vidrio", elegir mañana y la primera función.',
      'Agregar un boleto General para llevarlos a 2 y continuar.',
      'Elegir 2 asientos libres y continuar.',
      'Revisar el resumen y pulsar Continuar al pago.',
      'Llenar los datos de la tarjeta de prueba 4111111111111111 y pagar.',
    ],
    esperado: 'Al elegir los asientos aparece "Selección completa." y el resumen los lista. El resumen muestra el tiempo de retención. En el pago el número se formatea como "4111 1111 1111 1111" y se detecta Visa. El comprobante dice "Tu reserva está confirmada", con un código CP- de 6 caracteres, los asientos elegidos y la tarjeta terminada en 1111.',
  },
  'CP-14': {
    objetivo: 'Comprobar que el pago rechaza una tarjeta con número inválido, vencida y sin código de seguridad.',
    pasos: [
      'Registrarse con una cuenta nueva.',
      'Elegir la primera función de mañana de "La hora del vidrio", 1 asiento, y llegar al pago.',
      'Escribir el número 4111111111111112 (no pasa el algoritmo de Luhn), el vencimiento 01/20 y dejar vacío el código de seguridad.',
      'Pulsar Pagar.',
    ],
    esperado: 'Aparecen tres errores (número inválido, "La tarjeta está vencida." y código de seguridad inválido) y la página sigue en Finalizar compra, sin confirmar la reserva.',
  },
  'CP-15': {
    objetivo: 'Comprobar que se puede pagar con Yappy y que la reserva queda confirmada.',
    pasos: [
      'Registrarse con una cuenta nueva.',
      'Elegir la primera función de mañana de "El jardín de Ana", 1 asiento, y llegar al pago.',
      'Elegir Yappy como método de pago, escribir el teléfono 6123-4567 y pulsar "Enviar solicitud a Yappy".',
    ],
    esperado: 'Aparece "Tu reserva está confirmada" y el comprobante dice "Método: Yappy".',
  },
  'CP-16': {
    objetivo: 'Comprobar que un visitante sin sesión debe iniciar sesión para pagar y que no pierde los asientos elegidos.',
    pasos: [
      'Sin iniciar sesión, elegir la primera función de mañana de "La hora del vidrio" y 1 asiento.',
      'Continuar al resumen.',
      'Pulsar "Iniciar sesión para pagar" y entrar con la cuenta demo.',
    ],
    esperado: 'El resumen avisa que debes iniciar sesión, el inicio de sesión dice "Inicia sesión para continuar con tu reserva." y, después de entrar, vuelve a "Revisa tu reserva" con el mismo asiento.',
  },
  'CP-17': {
    objetivo: 'Comprobar que no se pueden comprar más de 8 boletos en una reserva.',
    pasos: [
      'Elegir la primera función de mañana de "La hora del vidrio".',
      'Pulsar 7 veces "Agregar General" hasta llegar a 8 boletos.',
    ],
    esperado: 'El contador queda en 8, el botón Agregar se desactiva y aparece el aviso "Máximo 8 boletos".',
  },
  'CP-18': {
    objetivo: 'Comprobar que una reserva comprada aparece en "Mis reservas" y que se puede buscar por código.',
    pasos: [
      'Registrarse con una cuenta nueva y comprar 2 boletos con tarjeta.',
      'Abrir "Mis reservas".',
      'Buscar por los primeros 5 caracteres del código.',
      'Buscar el código "CP-NOEXISTE".',
    ],
    esperado: 'Aparece 1 reserva con su código y el estado "Confirmada". La búsqueda parcial la sigue mostrando, y el código inexistente muestra "No encontramos reservas con ese código".',
  },
  'CP-19': {
    objetivo: 'Comprobar que el cliente puede cambiar los asientos de una reserva confirmada.',
    pasos: [
      'Registrarse con una cuenta nueva y comprar 2 boletos con tarjeta.',
      'Abrir el detalle de la reserva, pulsar "Editar asientos" y confirmar "Sí, cambiar asientos".',
      'Quitar los 2 asientos actuales y elegir 2 asientos libres distintos.',
      'Pulsar "Guardar nuevos asientos" y luego "Ver mi reserva".',
    ],
    esperado: 'Aparece "Modificando reserva" con el código y, al guardar, el aviso "Reserva actualizada". El comprobante muestra los asientos nuevos y el historial dice "Asientos modificados".',
  },
  'CP-20': {
    objetivo: 'Comprobar que el cliente puede cancelar una reserva y que queda registrada como cancelada.',
    pasos: [
      'Registrarse con una cuenta nueva y comprar 2 boletos con tarjeta.',
      'Abrir el detalle de la reserva y pulsar "Cancelar reserva".',
      'Confirmar con "Sí, cancelar reserva".',
      'Abrir "Mis reservas" y la pestaña Canceladas.',
    ],
    esperado: 'Se pide confirmación con el código de la reserva. Después, la reserva aparece como "Cancelada", con aviso de reembolso total y el botón "Cancelar reserva" desactivado, y figura en la pestaña Canceladas.',
  },
  'CP-21': {
    objetivo: 'Comprobar que un usuario no puede ver la reserva de otra cuenta, aunque usen el mismo navegador.',
    pasos: [
      'En una ventana, registrar a "Usuario Uno" y comprar 2 boletos.',
      'Copiar los datos guardados (reservas y usuarios) a una ventana nueva, para simular el mismo navegador.',
      'En la ventana nueva, registrar a "Usuario Dos".',
      'Abrir la dirección de la reserva de "Usuario Uno".',
    ],
    esperado: 'Se muestra "No tienes acceso a este recurso" y no se ve la reserva.',
  },
  'CP-22': {
    objetivo: 'Comprobar que el carrito de alimentos calcula bien el total y que el pedido se confirma.',
    pasos: [
      'Registrarse con una cuenta nueva y abrir "Alimentos y bebidas".',
      'Agregar un Combo pareja ($14.00) y 2 Refrescos 22 oz ($3.00 cada uno).',
      'Pulsar "Confirmar pedido" y luego Entendido.',
    ],
    esperado: 'El total es $20.00, la confirmación muestra "confirmado" y $20.00, y el pedido aparece en "Mis pedidos" con estado "Recibido".',
  },
  'CP-23': {
    objetivo: 'Comprobar que un cliente no puede entrar al panel de administración.',
    pasos: [
      'Registrarse con una cuenta nueva de cliente.',
      'Abrir la dirección #/admin.',
    ],
    esperado: 'Se muestra que la sección es de uso exclusivo para administradores y el menú no tiene "Panel Admin".',
  },
  'CP-24': {
    objetivo: 'Comprobar que el administrador ve las métricas del sistema y las reservas de los clientes.',
    pasos: [
      'Registrar a un cliente, comprar 2 boletos y cerrar sesión.',
      'Iniciar sesión como administrador (admin@cinepass.com).',
      'Abrir el Panel de administración.',
      'Abrir la pestaña "Todas las Reservas" y buscar el código de la compra.',
    ],
    esperado: 'El menú muestra "Panel Admin" y el panel "Panel de Control CinePass" indica 1 reserva confirmada. La tabla incluye el código y, al buscarlo, queda 1 sola fila.',
  },
  'CP-25': {
    objetivo: 'Comprobar que, cuando TMDB responde, la cartelera y el detalle muestran sus películas y la app usa el proxy sin credenciales. TMDB se simula con datos fijos.',
    pasos: [
      'Simular TMDB con page.route(): el proxy de Cloudflare responde con el archivo datos/tmdb-simulado.json (5 películas ficticias, una sin póster) y las imágenes con un póster local.',
      'Abrir la página de inicio y bajar a la Cartelera.',
      'Revisar las peticiones que hizo la app al proxy.',
      'Abrir el detalle de "El faro del Pacífico" y elegir el día de mañana.',
      'Abrir el detalle de "Ciudad de lluvia", que tiene una sinopsis larga.',
    ],
    esperado: 'La cartelera muestra las 4 películas con póster, en orden, y ninguna local ni la que no tiene póster. La app hizo 1 petición del listado y 4 de detalle, en español y sin api_key ni cabecera Authorization. El detalle muestra "Drama · +12 · 121 min · Estreno 2026-11-20", la directora Ana Castillo, la valoración 7.8 y el reparto de 4 actores, y tiene 3 funciones mañana. "Ciudad de lluvia" aparece como +16 y su sinopsis queda resumida a 300 caracteres o menos, terminando en una frase completa.',
  },
  'CP-26': {
    objetivo: 'Comprobar que, si TMDB falla, la app muestra las películas locales de respaldo.',
    pasos: [
      'Simular TMDB con page.route() para que el proxy responda con error 500.',
      'Abrir la página de inicio y bajar a la Cartelera.',
    ],
    esperado: 'La app intenta conectarse con TMDB y, al fallar, muestra las 8 películas locales ("8 películas disponibles", incluida "Nocturno en Colón") y ninguna de TMDB.',
  },
  // CP-27 a CP-32: solo con `npm run test:supabase` (base de datos centralizada en Supabase; ver supabase/README.md).
  'CP-27': {
    objetivo: 'Comprobar el registro y el inicio de sesión con Supabase Auth, y que la contraseña no queda guardada en el navegador.',
    pasos: [
      'Abrir Crear cuenta, llenar nombre, correo nuevo, teléfono y una contraseña válida, aceptar términos y registrarse.',
      'Consultar en la base de datos el perfil creado.',
      'Revisar localStorage y sessionStorage del navegador.',
      'Salir, intentar entrar con una contraseña incorrecta y luego con la correcta.',
    ],
    esperado: 'La cuenta se crea con rol "cliente" y la sesión queda iniciada. La contraseña no aparece en el almacenamiento del navegador. La contraseña incorrecta muestra "Correo o contraseña incorrectos." y la correcta inicia sesión.',
  },
  'CP-28': {
    objetivo: 'Comprobar que una reserva pagada con tarjeta se guarda en la base de datos centralizada con todos sus datos.',
    pasos: [
      'Iniciar sesión con un usuario de prueba.',
      'Elegir la primera función de mañana de "Nocturno en Colón", 2 boletos y 2 asientos, y pagar con la tarjeta de prueba.',
      'Consultar la reserva en Supabase por su código.',
      'Abrir "Mis reservas".',
    ],
    esperado: 'La reserva queda en Supabase como Confirmada, con método Tarjeta, el correo del usuario y los mismos 2 asientos. Aparece en "Mis reservas".',
  },
  'CP-29': {
    objetivo: 'Comprobar que dos sesiones de navegador distintas ven la disponibilidad actualizada.',
    pasos: [
      'Abrir dos navegadores independientes con usuarios distintos (A y B) en el mapa de asientos de la misma función.',
      'A elige un asiento y confirma la compra.',
      'Sin recargar la página de B, esperar la actualización automática del mapa.',
    ],
    esperado: 'En la sesión B el asiento reservado por A pasa a "ocupado" y queda deshabilitado sin recargar la página.',
  },
  'CP-30': {
    objetivo: 'Comprobar que si dos usuarios pagan el mismo asiento al mismo tiempo, solo uno lo consigue.',
    pasos: [
      'Abrir dos navegadores con usuarios distintos en la misma función.',
      'Los dos eligen el mismo asiento y llegan al pago.',
      'Pulsar "Pagar" en los dos al mismo tiempo.',
      'Consultar en la base de datos cuántas veces quedó reservado ese asiento.',
    ],
    esperado: 'Una sesión muestra "Tu reserva está confirmada" y la otra el mensaje "Asientos no disponibles" con el asiento en conflicto. En la base de datos el asiento queda reservado una sola vez.',
  },
  'CP-31': {
    objetivo: 'Comprobar que reservas simultáneas en funciones distintas se procesan sin bloquearse entre sí.',
    pasos: [
      'Abrir dos navegadores con usuarios distintos: A en una función de "Nocturno en Colón" y B en una de "Mar de ceniza".',
      'Elegir un asiento en cada uno y pulsar "Pagar" en los dos al mismo tiempo.',
    ],
    esperado: 'Las dos reservas se confirman.',
  },
  'CP-32': {
    objetivo: 'Comprobar que cancelar libera los asientos en el servidor y que el historial, la dulcería y el panel de administración siguen funcionando con Supabase.',
    pasos: [
      'El usuario de CP-28 abre su reserva y la cancela.',
      'Hace un pedido de dulcería.',
      'Un administrador abre el panel: Todas las Reservas, Dulcería (marca el pedido como entregado), Usuarios y Base de Datos.',
    ],
    esperado: 'La reserva queda Cancelada y sus asientos inactivos en la base de datos. El administrador ve la reserva y el correo del cliente, puede entregar el pedido, ve al usuario en la lista y en "Base de Datos" no aparece la opción de restablecer datos.',
  },
};
