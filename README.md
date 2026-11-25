# CinePass

**Iniciar en Windows:** Haz doble clic en `iniciar.bat` (o ejecuta `python iniciar.py`). Abre el navegador automáticamente.
También puedes abrir `index.html` con doble clic directamente en tu navegador.

## Cuentas de Acceso

* **Administrador:**
  - Correo: `admin@cinepass.com`
  - Contraseña: `Admin1234!`
  - Permite acceso al **Panel de Administración** (`#/admin`) con estadísticas de ingresos, boletos vendidos, gestión de reservas, dulcería, usuarios y copias de seguridad de la base de datos (JSON).
* **Cliente:**
  - Correo: `demo@cinepass.test`
  - Contraseña: `Demo1234!`
  - O puedes registrar una nueva cuenta con tu correo y contraseña segura.

## Nuevas Mejoras y Funcionalidades Implementadas

1. **Eliminación de avisos de simulación y datos de prueba:**
   - Se removió el aviso de datos bancarios de prueba en la pantalla de pago.
   - Textos de demostración y advertencias académicas removidos para una apariencia profesional y de producción.

2. **Base de Datos y Panel de Administración (`#/admin`):**
   - Persistencia estructurada en almacenamiento local para usuarios, reservas y pedidos de alimentos.
   - Panel exclusivo para administradores con:
     - Métricas financieras (ingresos totales, boletos vendidos, reservas activas vs canceladas).
     - Tabla interactiva con todas las reservas, buscador en tiempo real y opciones de gestión (ver detalle, cancelar).
     - Módulo de pedidos de dulcería con estados (Entregado, Cancelado).
     - Lista de usuarios registrados.
     - Descarga e importación de respaldos de base de datos en formato JSON.

3. **Validación estricta en Creación de Cuenta (`#/registro`):**
   - Verificación de contraseña: mínimo 8 caracteres, al menos una mayúscula, una minúscula, un número y un símbolo especial.
   - Indicador visual interactivo con lista de verificación en tiempo real.
   - Validación rigurosa de formato de correo electrónico y detección de cuentas duplicadas.

4. **Búsqueda en tiempo real optimizada:**
   - Barra de búsqueda del encabezado y de cartelera sincronizadas al instante mientras escribes.
   - Búsqueda desde el primer carácter por título, género, sinopsis, director y actores.
   - Visualización inmediata de todos los resultados coincidentes sin restricciones.

5. **Navegación y selección fluida:**
   - Selección instantánea de boletos, asientos y alimentos sin parpadeos, recargas completas de DOM ni saltos de desplazamiento.
   - Eliminación de animaciones bruscas durante la interacción.

6. **Validación avanzada de pagos y tarjetas:**
   - Detección automática de marca de tarjeta (Visa, Mastercard, American Express, Clave).
   - Formateo automático de número de tarjeta con espacios cada 4 dígitos.
   - Validación matemática mediante Algoritmo de Luhn.
   - Formateo y validación de fecha de vencimiento (MM/AA) comprobando fecha futura.
   - Validación de código de seguridad (CVV) y nombre del titular.

7. **Edición de Reservas:**
   - Los clientes pueden modificar los asientos de sus reservas confirmadas directamente desde el detalle de la reserva (`#/reserva/:cod`) hasta 2 horas antes de la función.
   - Los asientos anteriores se liberan y permiten seleccionar nuevos asientos conservando los mismos boletos.

8. **Múltiples Opciones de Pago:**
   - **Tarjeta de Crédito / Débito** (Visa, Mastercard, Amex, Clave).
   - **Yappy** (pago móvil instantáneo).
   - **PayPal** (pago seguro digital).
   - **Pago en Taquilla** (reserva apartada para abonar en ventanilla antes de la función).
