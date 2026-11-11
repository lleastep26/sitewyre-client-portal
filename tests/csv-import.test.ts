import { describe, expect, it } from "vitest";
import { parseReviewBlastCsv, REVIEW_BLAST_MAX_ROWS } from "@/lib/funnels/csv-import";

describe("parseReviewBlastCsv", () => {
  it("parses a plain CSV with the expected headers", () => {
    const csv = "first_name,phone,job_type,job_date\nSam,+14055551234,Roof repair,2026-01-01\n";
    const { rows, totalDataRows, truncated } = parseReviewBlastCsv(csv);
    expect(totalDataRows).toBe(1);
    expect(truncated).toBe(false);
    expect(rows).toEqual([
      {
        lineNumber: 2,
        firstName: "Sam",
        phone: "+14055551234",
        jobType: "Roof repair",
        jobDate: "2026-01-01",
      },
    ]);
  });

  it("strips a UTF-8 BOM", () => {
    const csv = "﻿first_name,phone\nSam,4055551234\n";
    const { rows } = parseReviewBlastCsv(csv);
    expect(rows[0].firstName).toBe("Sam");
    expect(rows[0].phone).toBe("4055551234");
  });

  it("handles CRLF line endings", () => {
    const csv = "first_name,phone\r\nSam,4055551234\r\nAlex,4055555678\r\n";
    const { rows } = parseReviewBlastCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1].firstName).toBe("Alex");
  });

  it("matches headers case/spacing/punctuation-insensitively", () => {
    const csv = "First Name,Phone,Job Type,Job-Date\nSam,4055551234,Roof,2026-01-01\n";
    const { rows } = parseReviewBlastCsv(csv);
    expect(rows[0]).toMatchObject({
      firstName: "Sam",
      phone: "4055551234",
      jobType: "Roof",
      jobDate: "2026-01-01",
    });
  });

  it("ignores extra columns not in the expected set", () => {
    const csv = "email,first_name,phone,notes\nx@y.com,Sam,4055551234,hello\n";
    const { rows } = parseReviewBlastCsv(csv);
    expect(rows[0]).toMatchObject({ firstName: "Sam", phone: "4055551234" });
  });

  it("handles quoted fields with embedded commas", () => {
    const csv = 'first_name,phone,job_type\n"Smith, Sam",4055551234,"Kitchen, full remodel"\n';
    const { rows } = parseReviewBlastCsv(csv);
    expect(rows[0]).toMatchObject({
      firstName: "Smith, Sam",
      jobType: "Kitchen, full remodel",
    });
  });

  it("caps processing at 2,000 rows and reports truncation", () => {
    const header = "first_name,phone\n";
    const dataRows = Array.from(
      { length: REVIEW_BLAST_MAX_ROWS + 50 },
      (_, i) => `Person${i},40555512${String(i).padStart(2, "0")}`,
    ).join("\n");
    const { rows, totalDataRows, truncated } = parseReviewBlastCsv(header + dataRows);
    expect(totalDataRows).toBe(REVIEW_BLAST_MAX_ROWS + 50);
    expect(rows).toHaveLength(REVIEW_BLAST_MAX_ROWS);
    expect(truncated).toBe(true);
  });

  it("does not report truncation when at or under the cap", () => {
    const header = "first_name,phone\n";
    const dataRows = Array.from(
      { length: REVIEW_BLAST_MAX_ROWS },
      (_, i) => `Person${i},40555512${String(i).padStart(2, "0")}`,
    ).join("\n");
    const { truncated } = parseReviewBlastCsv(header + dataRows);
    expect(truncated).toBe(false);
  });
});
