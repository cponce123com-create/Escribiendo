export * from "@prisma/client";
export { checkDatabaseConnection, prisma } from "./client";
export { COLUMNAS_ESPERADAS, missingColumns } from "./expected-schema";
export { checkSchema, esEsquemaDesactualizado } from "./schema";
