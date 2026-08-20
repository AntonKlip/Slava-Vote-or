import { defineConfig } from 'vitest/config';

// Тесты Phase 5+ бьют напрямую в реальный Neon (нет локальной/тестовой БД, см. DECISIONS.md D4)
// и делят один и тот же singleton-ряд VotingState между файлами — параллельные воркеры
// вызывали бы гонки между тестами, а не только внутри проверяемого кода.
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
