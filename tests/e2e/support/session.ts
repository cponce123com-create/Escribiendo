import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { readE2EConfig } from "../global-setup";

/**
 * Estado compartido entre los archivos de prueba de extremo a extremo.
 *
 * La suite corre con un único worker y de forma serial, así que todos los
 * archivos comparten proceso y, por tanto, este módulo. Se centraliza el
 * estado de la cuenta de pruebas porque el flujo de acceso cambia la
 * contraseña a mitad de camino y las pruebas posteriores necesitan conocer la
 * vigente.
 */

const config = readE2EConfig();

export const E2E_USER_EMAIL = config.userEmail;
export const E2E_INITIAL_PASSWORD = config.userPassword;

/** Contraseña con la que la suite sustituye la inicial. */
export const E2E_ROTATED_PASSWORD = "R0taci0n-Cont3nido-S3guro-2026";

export const e2eSession = {
  email: config.userEmail,
  password: config.userPassword,
  name: "Estudio E2E",
};

/** Ruta del estado de sesión compartido. */
export const E2E_STORAGE_STATE_PATH = path.join(os.tmpdir(), "escribiendo-e2e-storage.json");

/** Crea la cuenta de pruebas mediante la ruta de instalación. */
export async function createAccount(page: Page): Promise<void> {
  await page.goto("/setup");

  await expect(page.getByRole("heading", { name: "Crear la primera cuenta" })).toBeVisible();

  await page.getByLabel("Token de instalación").fill(config.setupToken);
  await page.getByLabel("Nombre", { exact: true }).fill(e2eSession.name);
  await page.getByLabel("Correo electrónico").fill(e2eSession.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(e2eSession.password);
  await page.getByLabel("Repite la contraseña").fill(e2eSession.password);

  await Promise.all([
    page.waitForURL(/\/dashboard$/u),
    page.getByRole("button", { name: "Crear cuenta y entrar" }).click(),
  ]);
}

/** Inicia sesión con la contraseña vigente de la cuenta de pruebas. */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(e2eSession.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(e2eSession.password);

  await Promise.all([
    page.waitForURL(/\/dashboard$/u),
    page.getByRole("button", { name: "Entrar en el estudio" }).click(),
  ]);

  await expect(page).toHaveURL(/\/dashboard$/u);
}

/**
 * Crea un contexto con la sesión compartida.
 *
 * La sesión la prepara el proyecto de preparación (`auth.setup.ts`); este
 * helper existe para las pruebas que necesitan un contexto propio.
 */
export async function newSharedContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: E2E_STORAGE_STATE_PATH });
}
