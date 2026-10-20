# Guía de uso de Flatpare

Flatpare ayuda a un hogar a comparar pisos en grupo. Sube anuncios en PDF, valóralos y míralo todo uno al lado del otro, con tus datos cifrados en tu navegador antes de guardarse.

---

## Primeros pasos

### 1. Inicia sesión

Inicia sesión con Google o con un enlace que te enviamos por correo, o con la contraseña compartida de tu hogar si así está configurado tu Flatpare. Pon tu nombre en la página Ajustes para que todos sepan quién ha dicho qué; hasta que lo hagas, tu hogar ve tu dirección de correo en tus valoraciones.

### 2. Elige una frase de contraseña

La primera vez que inicias sesión, Flatpare te pide que **elijas una frase de contraseña** (al menos 12 caracteres). No es un segundo inicio de sesión: es la clave que cifra en tu navegador los pisos, las valoraciones y las notas de tu hogar.

**Flatpare nunca ve esta frase de contraseña y no puede restablecerla por ti.** De eso se trata: es lo que impide que cualquiera que gestione el servidor, nosotros incluidos, lea tu búsqueda.

Te la volverá a pedir en cada dispositivo o navegador nuevo que uses, y después de bloquear Flatpare.

### 3. Guarda tu kit de recuperación

Justo después de elegir la frase de contraseña, verás un **código de recuperación de 25 caracteres, una sola vez**. Apúntalo o imprímelo, y guárdalo en un lugar seguro.

> **Esta es la pantalla más importante de Flatpare.** El código de recuperación es la única forma de volver a entrar si olvidas tu frase de contraseña. Si pierdes las dos cosas, los datos de tu hogar desaparecen para siempre: nadie puede recuperarlos, porque nadie más ha tenido nunca la clave.

Trátalo como la llave de casa, no como una pista de contraseña. Una copia impresa en un cajón está bien. Una nota en el mismo gestor de contraseñas que todo lo demás sirve de poco si pierdes el acceso a él.

### 4. Unirte a un hogar que ha creado otra persona

Si te han invitado a un hogar que ya existe, eliges tu propia frase de contraseña de la misma forma y luego verás **«Ya casi está»**.

Flatpare espera a que alguien que ya está en el hogar abra la aplicación: en ese momento, su navegador le pasa al tuyo una copia de la clave del hogar, automáticamente. **No tiene que hacer nada**, pero sí tiene que abrir Flatpare al menos una vez. La pantalla vuelve a comprobarlo cada pocos segundos y avanza sola.

### 5. Añade un piso

Ve a **Subir** en la barra de navegación y arrastra (o selecciona) un anuncio en PDF. Si la extracción con IA está configurada, Flatpare saca:

- Nombre o título del piso
- Dirección
- Superficie (m²), habitaciones, baños, balcones
- Alquiler mensual (CHF)

Si no hay IA configurada, rellena los campos a mano. En cualquier caso llegas a la página del piso para revisar y corregir lo que haya salido mal: la extracción es un punto de partida, no un oráculo.

### 6. Valora los pisos

En la página de cada piso, valóralo en cinco categorías:

| Categoría | Qué tener en cuenta |
|----------|-----------------|
| **Cocina** | Tamaño, electrodomésticos, distribución, luz natural |
| **Balcones** | Tamaño, vistas, privacidad, sol |
| **Ubicación** | Barrio, ruido, tiendas, parques |
| **Distribución** | Reparto de las habitaciones, circulación, almacenaje, practicidad |
| **Impresión general** | Lo que te dice la intuición después de la visita |

Haz clic en una estrella para poner una valoración (1-5); vuelve a hacer clic en la misma estrella para quitarla. Valoras por tu cuenta: cada persona del hogar valora por separado, y la comparación muestra las puntuaciones una al lado de la otra en lugar de hacer desaparecer un desacuerdo con una media.

### 7. Compara

Ve a **Comparar** para ver todos los pisos en una sola tabla. Resalta el mejor valor de cada fila (el alquiler más bajo, la valoración más alta, el trayecto más corto). Desplázate en horizontal si hay más pisos de los que caben.

---

## Funciones

### Lugares de interés

En la página **Hogar**, guarda hasta **cinco** sitios a los que vas de verdad: el trabajo, el gimnasio, tu hermana. Cada piso muestra entonces cuánto se tarda en llegar a cada uno en bici y en transporte público.

Los eliges tú; Flatpare no da por hecho adónde te desplazas.

### Distancias

Los tiempos de trayecto se miden desde cada piso hasta cada uno de tus lugares guardados:

- **Bici**: con Google Maps u OpenRouteService
- **Transporte público**: con Google Maps (no disponible con OpenRouteService)

Si no hay ninguna API de distancias configurada, puedes introducir los tiempos a mano.

### Gestión de los PDF

- Subida de uno o de varios a la vez
- **Los PDF se cifran en tu navegador antes de subirse.** Lo que se guarda es texto cifrado; al abrir uno, se vuelve a descifrar en tu dispositivo
- La extracción usa Gemini 2.5 Flash. En flatpare.com pasa por Vercel AI Gateway con retención de datos cero: ni Vercel ni el proveedor del modelo guardan nada

### Lo que ve el servidor

Casi nada. Tus pisos, valoraciones, notas y PDF se cifran antes de salir de tu navegador.

Hay una excepción deliberada, y conviene conocerla: **geolocalizar una dirección, medir un tiempo de trayecto, comprobar si un anuncio sigue en línea y leer un PDF** no se pueden hacer en tu navegador. Para eso, ese único elemento se envía en forma legible: una dirección a Google Maps (u OpenRouteService en algunas instalaciones propias) para obtener su ubicación y los tiempos de trayecto, la URL de un anuncio que nuestro servidor abre en la propia web del anuncio, y un PDF al modelo de IA que lo lee. Nuestro servidor lo usa para esa única llamada, nunca lo escribe en la base de datos y nunca lo registra.

### Gestionar tu clave

En **Ajustes**, puedes:

- **Bloquear este dispositivo**: borra la clave de este navegador sin cerrar sesión. Útil en un ordenador compartido o prestado; necesitarás tu frase de contraseña para desbloquearlo de nuevo.
- **Cambiar la frase de contraseña**: conserva tus datos y vuelve a proteger la clave con una frase de contraseña nueva.
- **Generar un nuevo kit de recuperación** (solo quien administra el hogar): emite un código de recuperación nuevo e invalida el anterior. Hazlo si crees que alguien más ha visto la copia impresa.

---

## Si usas la versión alojada

**Durante la beta privada es gratis.** Lo que recibe una cuenta de la beta es tuyo: ni tus datos ni tus créditos se retiran cuando termine la beta.

Flatpare cuesta **CHF 5, una sola vez**; no es una suscripción. Cubre hasta 10 personas y 40 pisos en un hogar.

Los 40 cuentan los pisos que **añades**, no los que conservas: eliminar uno libera sitio en tu comparación, pero no te devuelve el crédito. Cuando hayas usado tus 40, otros CHF 5 añaden otros 40.

Quedarte sin créditos solo te impide añadir pisos nuevos. Nunca te bloquea el acceso a los que ya tienes.

Instalar Flatpare por tu cuenta es gratis y no tiene ningún límite.

---

## Consejos

- **¿Has olvidado tu frase de contraseña?** La pantalla de desbloqueo ofrece **«Usar mi kit de recuperación»**: introduce el código de 25 caracteres y elige una frase de contraseña nueva. Si no tienes ni la frase de contraseña ni el código, nadie puede recuperar los datos.
- **«Restablecer mis claves»** también aparece ahí, y *no* es un restablecimiento de contraseña: abandona la clave antigua y espera a que alguien más del hogar te pase una copia nueva. Solo sirve si otra persona todavía tiene acceso.
- **Dispositivo nuevo:** basta con iniciar sesión e introducir tu frase de contraseña; no hay que transferir nada a mano.
- **Subida de varios a la vez:** puedes seleccionar varios PDF de una vez en la página Subir.
- **Vuelve a valorar cuando quieras:** las valoraciones son de cada persona y se pueden cambiar en cualquier momento.
- **Pensado para el móvil:** usa la barra de navegación inferior en tu teléfono.
