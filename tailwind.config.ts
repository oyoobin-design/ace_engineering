import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "ace-navy":   "#1A1A1A",   // 로고 다크/블랙
        "ace-blue":   "#C8272D",   // 로고 레드 (주 액션 컬러)
        "ace-sky":    "#1E7A3C",   // 로고 그린 (보조 컬러)
        "ace-light":  "#FDEAEA",   // 연한 레드 틴트
        "ace-gray":   "#F5F5F5",   // 페이지 배경
        "ace-border": "#E0E0E0",   // 테두리
        "ace-text":   "#1A1A1A",   // 본문 텍스트
        "ace-muted":  "#6B7280",   // 보조 텍스트
        "ace-red":    "#C8272D",   // 레드 (로고 레드)
        "ace-green":  "#1E7A3C",   // 그린 (로고 그린)
        "ace-amber":  "#D97706",   // 경고
      },
    },
  },
  plugins: [],
};
export default config;
