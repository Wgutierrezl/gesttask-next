import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface Statement {
  Effect: string;
  Action: string | string[];
  Resource: string | string[];
  Condition?: unknown;
}

const doc = readFileSync(resolve(__dirname, "../../docs/go-live.md"), "utf8");
const statements: Statement[] = [...doc.matchAll(/```json\n([\s\S]*?)```/g)]
  .map((match) => JSON.parse(match[1]!) as { Statement?: Statement[] })
  .flatMap((policy) => policy.Statement ?? []);
const actionsOf = (s: Statement) => (Array.isArray(s.Action) ? s.Action : [s.Action]);

describe("the S3 policies in the go-live checklist", () => {
  it("lets the app list the bucket WITHOUT an s3:prefix condition (a HeadObject on a missing key has no prefix: it would be 403, not 404)", () => {
    const list = statements.filter((s) => s.Effect === "Allow" && actionsOf(s).includes("s3:ListBucket"));
    expect(list).toHaveLength(1);
    expect(list[0]!.Resource).toBe("arn:aws:s3:::BUCKET");
    expect(list[0]!.Condition).toBeUndefined();
  });

  it("keeps object access inside boards/*", () => {
    const objects = statements.find((s) => s.Effect === "Allow" && actionsOf(s).includes("s3:PutObject"));
    expect(objects?.Resource).toBe("arn:aws:s3:::BUCKET/boards/*");
    expect(actionsOf(objects!).sort()).toEqual(["s3:DeleteObject", "s3:GetObject", "s3:PutObject"]);
  });

  it("has a bucket policy that denies every request not made over TLS, for the bucket and its objects", () => {
    const deny = statements.find((s) => s.Effect === "Deny");
    expect(deny).toMatchObject({
      Action: "s3:*",
      Resource: ["arn:aws:s3:::BUCKET", "arn:aws:s3:::BUCKET/*"],
      Condition: { Bool: { "aws:SecureTransport": "false" } },
    });
  });

  it("tells the reader to turn Block Public Access on and keeps secrets off the command line", () => {
    expect(doc).toMatch(/Block Public Access ON, all four settings/);
    expect(doc).not.toMatch(/AWS_SECRET_ACCESS_KEY=\.\.\./);
    expect(doc).not.toMatch(/DATABASE_URL='/);
    expect(doc).toMatch(/read -rs/);
  });

  it("states that every trusted hop must append to X-Forwarded-For and X-Forwarded-Proto", () => {
    expect(doc).toMatch(/EVERY trusted hop \*\*appends\*\* to `X-Forwarded-For` and `X-Forwarded-Proto`/);
  });
});
