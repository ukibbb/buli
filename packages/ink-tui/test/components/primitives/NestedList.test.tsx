import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { stripVTControlCharacters } from "node:util";
import { Text } from "ink";
import { NestedList } from "../../../src/components/primitives/NestedList.tsx";

test("NestedList renders top-level and nested item content", () => {
  const plain = stripVTControlCharacters(
    renderToString(
      <NestedList items={[
        {
          itemContent: <Text>parent</Text>,
          childItems: [
            { itemContent: <Text>child</Text> },
          ],
        },
      ]} />,
    ),
  );
  expect(plain).toContain("parent");
  expect(plain).toContain("child");
});
