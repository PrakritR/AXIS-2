import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

process.env.FINANCIALS_TIN_ENCRYPTION_KEY ??= "test-only-tin-key-do-not-use-in-prod";

vi.mock("server-only", () => ({}));
