import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );

export const bookMetadataSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "El título es obligatorio.")
    .max(300, "El título no puede superar los 300 caracteres."),
  subtitle: optionalText(300),
  authorName: z
    .string()
    .trim()
    .min(1, "El autor es obligatorio.")
    .max(200, "El nombre del autor no puede superar los 200 caracteres."),
  penName: optionalText(200),
  description: optionalText(10_000),
  genre: optionalText(100),
  language: z
    .string()
    .trim()
    .min(2, "El idioma es obligatorio.")
    .max(20)
    .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u, "El código de idioma no es válido.")
    .default("es"),
  targetWordCount: z.number().int().positive().max(10_000_000).optional(),
});

export type BookMetadataInput = z.infer<typeof bookMetadataSchema>;

export const BOOK_SECTION_TYPES = [
  "HALF_TITLE",
  "TITLE_PAGE",
  "COPYRIGHT",
  "DEDICATION",
  "EPIGRAPH",
  "TABLE_OF_CONTENTS",
  "FOREWORD",
  "PROLOGUE",
  "INTRODUCTION",
  "PART",
  "CHAPTER",
  "SUBCHAPTER",
  "INTERLUDE",
  "EPILOGUE",
  "ACKNOWLEDGMENTS",
  "AUTHOR_NOTES",
  "ABOUT_AUTHOR",
  "BIBLIOGRAPHY",
  "GLOSSARY",
  "APPENDIX",
  "OTHER_BOOKS",
  "CUSTOM",
] as const;

export type BookSectionType = (typeof BOOK_SECTION_TYPES)[number];

export const CHAPTER_LIKE_SECTION_TYPES: ReadonlySet<BookSectionType> = new Set([
  "PART",
  "CHAPTER",
  "SUBCHAPTER",
  "INTERLUDE",
  "PROLOGUE",
  "EPILOGUE",
  "INTRODUCTION",
]);
