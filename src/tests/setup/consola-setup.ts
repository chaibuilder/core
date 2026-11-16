import { consola } from "consola";
import { consolaFanOutReporter } from "../utils/capture-consola";

// First setup file, so it runs before anything creates a `consola.withTag(...)` logger. Tagged
// loggers copy the root's level and reporter list when created; giving the root a single fan-out
// reporter now means every logger — whenever it is created — reports to `captureConsola()`.
// Nothing prints to stdout.
consola.level = 5;
consola.setReporters([consolaFanOutReporter]);
