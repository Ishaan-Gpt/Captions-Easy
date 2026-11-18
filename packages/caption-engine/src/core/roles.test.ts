import { describe, expect, it } from "vitest";
import type { Word, WordRole } from "@capseasy/shared";
import { assignRoles } from "./roles";

const words = (text: string, extra: Record<number, Partial<Word>> = {}): Word[] =>
  text.split(" ").map((t, i) => ({ id: `w${i}`, text: t, startMs: i * 300, endMs: i * 300 + 280, ...extra[i] }));
const roles = (text: string, opts = {}) => {
  const w = words(text);
  return Object.fromEntries(assignRoles(w, opts).map((r, i) => [`${i}:${w[i]!.text}`, r ?? "-"]));
};

describe("assignRoles", () => {
  it("finds numbers, names, emphasis, titles, connectors and one key per card", () => {
    const r = roles('So in 2024 Priya read "Atomic Habits" and made 10,000 dollars. That is REALLY wild!');
    expect(r).toMatchObject({
      "0:So": "connector", "1:in": "connector", "2:2024": "number", "3:Priya": "name", "5:\"Atomic": "title", "6:Habits\"": "title",
      "7:and": "connector", "9:10,000": "number", "11:That": "connector", "12:is": "connector", "13:REALLY": "emphasis", "14:wild!": "emphasis",
    });
    // a card whose best word is already a number/name gets no extra key; plain cards get one
    expect(Object.values(roles("the quiet part nobody tells you about saving money")).filter((x) => x === "key").length).toBeGreaterThanOrEqual(2);
  });

  it("is deterministic and keeps explicit roles", () => {
    const w = words("we grew revenue five times this year");
    const explicit: (WordRole | undefined)[] = [];
    explicit[2] = "emphasis";
    const a = assignRoles(w, { explicit });
    expect(a).toEqual(assignRoles(w, { explicit }));
    expect(a[2]).toBe("emphasis");
    expect(a[3]).toBe("number");
    expect(assignRoles(w, { explicit, auto: false }).filter(Boolean)).toEqual(["emphasis"]);
  });

  it("understands romanized Hinglish connectors and number words", () => {
    const r = roles("main ne ek lakh rupaye kamaye aur ye sab bhi");
    expect(r).toMatchObject({ "0:main": "connector", "2:ek": "number", "3:lakh": "number", "6:aur": "connector", "7:ye": "connector", "9:bhi": "connector" });
  });

  it("ignores capitalisation in shouty or Title Case transcripts", () => {
    expect(Object.values(roles("THIS IS HOW WE WON THE GAME")).filter((x) => x === "emphasis")).toEqual([]);
    expect(Object.values(roles("This Is How We Won The Game")).filter((x) => x === "name")).toEqual([]);
  });

  it("a hero emphasis is the card's key", () => {
    const w = words("the quiet part out loud", { 1: { emphasis: "hero" } });
    expect(assignRoles(w)[1]).toBe("key");
  });
});
