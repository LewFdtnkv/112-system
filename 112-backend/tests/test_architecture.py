"""Guard useful dependency boundaries, not arbitrary file sizes or class patterns."""

import ast
from importlib.util import resolve_name
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    str(p.relative_to(ROOT).with_suffix("")).replace("/", ".").removesuffix(".__init__"): p
    for p in (ROOT / "app").rglob("*.py")
}


def imports(path, module):
    package = module if path.name == "__init__.py" else module.rpartition(".")[0]
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            target = node.module or ""
            if node.level:
                target = resolve_name("." * node.level + target, package)
            yield target
            # Handle `from app.services import domain as alias` as a module dependency too.
            for alias in node.names:
                child = f"{target}.{alias.name}"
                if child in FILES:
                    yield child


def test_application_layers_do_not_depend_on_http_endpoints():
    violations = []
    for module, path in FILES.items():
        for target in imports(path, module):
            if module.startswith(
                ("app.services.", "app.core.", "app.models.", "app.schemas.", "app.db.")
            ):
                if target.startswith("app.api"):
                    violations.append((module, target))
            if module.startswith(("app.core.", "app.models.", "app.schemas.", "app.db.")):
                if target.startswith("app.services"):
                    violations.append((module, target))
            if module.startswith("app.api.v1.") and path.name not in {"__init__.py", "router.py"}:
                if target.startswith("app.api.v1."):
                    violations.append((module, target))
    assert not violations, f"Wrong dependency direction: {violations}"


def test_seed_scripts_use_services_instead_of_calling_http_endpoints():
    violations = []
    for path in (ROOT / "scripts").glob("*.py"):
        module = f"scripts.{path.stem}"
        violations.extend((module, t) for t in imports(path, module) if t.startswith("app.api"))
    assert not violations, f"CLI calling endpoint implementation: {violations}"


def test_services_have_no_import_cycles_including_local_imports():
    services = {m: p for m, p in FILES.items() if m.startswith("app.services")}
    graph = {m: set(imports(p, m)) & services.keys() for m, p in services.items()}
    visited, active = set(), []

    def visit(module):
        assert module not in active, f"Service dependency cycle: {' -> '.join([*active, module])}"
        if module in visited:
            return
        active.append(module)
        for target in sorted(graph[module]):
            visit(target)
        active.pop()
        visited.add(module)

    for module in sorted(graph):
        visit(module)
