export const IMPORT_SECTION_TYPES = {
  CHAPTER: "Capítulo",
  PART: "Parte",
  PROLOGUE: "Prólogo",
  EPILOGUE: "Epílogo",
  INTRODUCTION: "Introducción",
  FOREWORD: "Prefacio",
  DEDICATION: "Dedicatoria",
  EPIGRAPH: "Epígrafe",
  ACKNOWLEDGMENTS: "Agradecimientos",
  ABOUT_AUTHOR: "Acerca de la autoría",
  BIBLIOGRAPHY: "Bibliografía",
  COPYRIGHT: "Página legal original",
  TABLE_OF_CONTENTS: "Índice original",
  TITLE_PAGE: "Portada interior",
  CUSTOM: "Texto sin clasificar",
} as const;
export type ImportSectionType = keyof typeof IMPORT_SECTION_TYPES;
export interface ImportSectionChoice {
  index: number;
  title: string;
  type: ImportSectionType;
  include: boolean;
}
export interface ImportPreview {
  fingerprint: string;
  format: string;
  title: string;
  authorName: string;
  warnings: string[];
  sections: Array<{
    index: number;
    title: string;
    type: ImportSectionType;
    words: number;
    excerpt: string;
  }>;
}
export interface ImportAnalysisState {
  status: "idle" | "error" | "success";
  message?: string;
  preview?: ImportPreview;
}
