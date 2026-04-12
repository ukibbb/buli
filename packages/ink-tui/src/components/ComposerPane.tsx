import { Text } from "ink";

export type ComposerPaneProps = {
  value: string;
  disabled: boolean;
};

export function ComposerPane(props: ComposerPaneProps) {
  const suffix = props.disabled ? "" : "_";

  return <Text>{`> ${props.value}${suffix}`}</Text>;
}
