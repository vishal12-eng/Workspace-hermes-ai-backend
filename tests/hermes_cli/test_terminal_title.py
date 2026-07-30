from __future__ import annotations

from hermes_cli.terminal_title import (
    compose_terminal_title,
    sanitize_terminal_title,
    write_terminal_title,
)


class _Terminal:
    def __init__(self, *, isatty: bool = True) -> None:
        self._isatty = isatty
        self.writes: list[str] = []
        self.flushed = False

    def isatty(self) -> bool:
        return self._isatty

    def write(self, value: str) -> None:
        self.writes.append(value)

    def flush(self) -> None:
        self.flushed = True


def test_compose_terminal_title_uses_skin_symbol_session_and_busy_marker():
    assert compose_terminal_title(" ⚔ Ares ", "Release prep") == "⚔ Release prep"
    assert compose_terminal_title(" ⚔ Ares ", "Release prep", busy=True) == "⚔ Release prep ⏳"
    assert compose_terminal_title(" ⚔ Ares ") == "⚔"


def test_sanitize_terminal_title_removes_terminal_control_sequences_and_bounds_length():
    title = sanitize_terminal_title("Build\x1b]2;injected\a\nready")

    assert title == "Build]2;injectedready"
    assert len(sanitize_terminal_title("x" * 201)) == 200


def test_write_terminal_title_emits_icon_and_window_sequences(monkeypatch):
    monkeypatch.setenv("TERM", "xterm-256color")
    terminal = _Terminal()

    assert write_terminal_title("⚕ Planning", terminal)
    assert terminal.writes == ["\033]1;⚕ Planning\a\033]2;⚕ Planning\a"]
    assert terminal.flushed


def test_write_terminal_title_skips_dumb_and_noninteractive_output(monkeypatch):
    terminal = _Terminal()
    monkeypatch.setenv("TERM", "dumb")
    assert not write_terminal_title("Hermes", terminal)

    monkeypatch.setenv("TERM", "xterm-256color")
    assert not write_terminal_title("Hermes", _Terminal(isatty=False))
