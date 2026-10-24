import { useState } from "react";

export function SeedBackupCheck({ mnemonic, onConfirmed }: { mnemonic: string; onConfirmed: () => void }) {
  const words = mnemonic.trim().split(/\s+/);
  const [positions] = useState(() => {
    const indices = Array.from({ length: 12 }, (_, index) => index);
    for (let index = indices.length - 1; index > 0; index--) {
      const value = new Uint32Array(1);
      crypto.getRandomValues(value);
      const other = value[0] % (index + 1);
      [indices[index], indices[other]] = [indices[other], indices[index]];
    }
    return indices.slice(0, 3).sort((a, b) => a - b);
  });
  const [answers, setAnswers] = useState(["", "", ""]);
  const valid = positions.every((position, index) => answers[index].trim().toLowerCase() === words[position]);
  return <fieldset className="dvcFieldRow">
    <legend>Over zálohu: doplň tri slová zo svojej uloženej kópie</legend>
    {positions.map((position, index) => <label key={position} className="dvcLabel">
      Slovo č. {position + 1}
      <input className="dvcInput" value={answers[index]} autoComplete="off" autoCapitalize="off" spellCheck={false}
        onChange={event => setAnswers(previous => previous.map((value, current) => current === index ? event.target.value : value))} />
    </label>)}
    <button type="button" className="dvcBtn dvcBtnPrimary" disabled={!valid} onClick={onConfirmed}>Potvrdiť zálohu a odstrániť slová zo zariadenia</button>
  </fieldset>;
}
