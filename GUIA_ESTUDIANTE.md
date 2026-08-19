# Guía del estudiante

## ¿Qué debes ser capaz de hacer?

No se espera que memorices Three.js, TSL o WebGPU. Sí debes poder:

1. Explicar dónde vive el estado de las partículas;
2. Localizar las fuerzas y relacionarlas con ecuaciones;
3. Predecir qué debería ocurrir al aislar una fuerza;
4. Usar predicciones y observaciones para detectar una implementación incorrecta;
5. Modificar deliberadamente el sistema con ayuda de IA;
6. Desplegar una URL funcional;
7. Convertir parámetros del sistema en controles expresivos para una interpretación en vivo.

## Modelo mental

```text
FIGURA DIBUJADA (condición inicial)
        ↓
CONTROLES DEL INTÉRPRETE
        ↓
PARÁMETROS / UNIFORMS
        ↓
COMPUTE EN GPU
estado → fuerzas → aceleración → velocidad → posición
        ↓
BUFFERS DE POSICIÓN Y VELOCIDAD
        ↓
RENDER
material + instancias + cámara → pantalla
```

### La figura es condición inicial, no trayectoria

El dibujo entra por arriba del modelo, una sola vez: decide **dónde nacen** las
partículas y con qué velocidad (`initialSpeed`, cero por defecto). No vuelve a tocar
posiciones nunca más. Todo lo que la figura hace después —organizarse, tensarse,
dispersarse, colapsar— sale del bloque de fuerzas del compute shader.

Esa frontera es lo que distingue un instrumento de una animación, y se puede verificar:
con las cuatro capas apagadas, la figura debe quedarse absolutamente inmóvil.

### Cero partículas al arrancar

El buffer en GPU tiene tamaño fijo (2^17 slots), así que «cero partículas» no significa
un buffer vacío sino que ningún slot está ocupado. Un tercer buffer, `aliveBuffer`,
marca con 1 o 0 qué slots existen: el compute los salta y el render los dibuja con
escala 0. Al dibujar, cada tramo del trazo ocupa un bloque de 256 slots consecutivos, en
anillo. Por eso `R` (cero partículas) y `0` (restaurar la figura) son operaciones
baratas: sólo reescriben ese estado.

### CPU y GPU

JavaScript organiza la aplicación y modifica parámetros. La actualización masiva de partículas ocurre en GPU. El compute pass ejecuta conceptualmente la misma regla para muchas partículas en paralelo.

### TSL

TSL es la capa de Three.js con la que expresamos operaciones que Three.js convierte al shader apropiado. No necesitas escribir WGSL directamente en esta unidad.

## Cinco exploraciones antes de diseñar

Dibuja primero una figura con `D` —un círculo funciona bien porque su simetría hace
evidente cualquier asimetría de la fuerza— y déjala fija como condición inicial. En modo
LAB, `1..5` aíslan una capa y devuelven la figura a su estado dibujado, así que las cinco
exploraciones parten del mismo punto y son comparables entre sí. Registra la predicción
y la observación:

0. **Reposo:** sin ninguna fuerza activa, la figura no se mueve en absoluto. Si se mueve,
   hay algo empujando posiciones fuera del modelo de fuerzas.
1. **Inercia:** sin fuerzas, una partícula que ya se mueve conserva aproximadamente su movimiento.
2. **Atracción (`1`):** la aceleración debe apuntar hacia el atractor, y ser más fuerte
   cuanto más cerca esté.
3. **Repulsión (`2`):** el comportamiento debe invertirse respecto a la atracción. No es
   la misma fuerza con el signo cambiado: cae más deprisa con la distancia, así que se
   nota sobre todo de cerca.
4. **Fricción (`3`):** es un freno, no un empuje. Sobre una figura quieta no debe hacer
   nada; sobre una en movimiento, debe restarle rapidez.
5. **Gravedad (`4`):** un campo constante hacia abajo. A diferencia de la atracción, no
   debe importar dónde esté el atractor: muévelo y el efecto no cambia.
6. **Todas juntas (`5`):** atracción y repulsión se equilibran en un radio y la figura se
   ordena en una cáscara; la gravedad la arrastra y la fricción evita que se dispare.

No aceptes como evidencia «se ve interesante». Formula primero una predicción.

## Cómo trabajar con IA

No pidas: «hazme una obra de partículas».

Trabaja así:

1. Define la intención;
2. Formula o selecciona una fuerza;
3. Explica a la IA la arquitectura existente;
4. Pide una modificación localizada;
5. Exige que preserve `estado → fuerzas → integración → render`;
6. Ejecuta una exploración aislada;
7. Solo después integra la fuerza al instrumento.

Un buen prompt incluye: archivo a modificar, ecuación o comportamiento deseado, parámetros que deben ser uniforms, prueba esperada y restricciones que no deben tocarse.

## Criterio de dominio

Debes poder señalar en el proyecto:

- **estado:** `positionBuffer`, `velocityBuffer`, `aliveBuffer`;
- **condición inicial:** `spawnSegment` de `createSimulation.js` (el pincel);
- **fuerzas:** bloque `force` de `createSimulation.js`;
- **integración:** actualización de `v` y `p`;
- **render:** `SpriteNodeMaterial` + `InstancedMesh`;
- **controles:** panel y mapeo de teclado/puntero.

Si una modificación de IA no puedes ubicarla en este mapa, aún no está bajo tu control.
