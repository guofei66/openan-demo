from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_rest_routes
from a2a.server.tasks.inmemory_task_store import InMemoryTaskStore
from starlette.applications import Starlette

from .agent_card import build_agent_card
from .executor import MockAgentExecutor


class EchoExtensionsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        extension_values = [value for key, value in scope["headers"] if key == b"a2a-extensions"]
        extension_header = b", ".join(extension_values)

        async def send_wrapper(message):
            if message["type"] == "http.response.start" and extension_header:
                response_headers = message.setdefault("headers", [])
                if all(key != b"a2a-extensions" for key, _ in response_headers):
                    response_headers.append((b"a2a-extensions", extension_header))
            await send(message)

        await self.app(scope, receive, send_wrapper)


def build_a2a_app(
    public_url: str,
    executor: MockAgentExecutor,
    *,
    agent_name: str | None = None,
    agent_description: str | None = None,
):
    agent_card = build_agent_card(public_url, name=agent_name, description=agent_description)
    handler = DefaultRequestHandler(
        agent_executor=executor, task_store=InMemoryTaskStore(), agent_card=agent_card
    )
    routes = [*create_agent_card_routes(agent_card), *create_rest_routes(handler)]
    return EchoExtensionsMiddleware(Starlette(routes=routes))
