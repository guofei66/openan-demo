from pydantic import BaseModel, Field, field_validator, model_validator


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=8)
    role: str = Field(default="user", pattern="^(admin|user)$")


class UserPatch(BaseModel):
    enabled: bool | None = None
    role: str | None = Field(default=None, pattern="^(admin|user)$")
    password: str | None = Field(default=None, min_length=8)


class SeedCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    templateUri: str = Field(min_length=1, max_length=256)
    seedJson: dict
    description: str = ""


class SeedPatch(BaseModel):
    name: str | None = None
    templateUri: str | None = None
    seedJson: dict | None = None
    description: str | None = None


class VariantImportRequest(BaseModel):
    seedId: int | None = None
    agentId: int | None = None
    templateUri: str = Field(min_length=1, max_length=256)
    variants: list[dict]


class VariantPatch(BaseModel):
    enabled: bool | None = None
    variantJson: dict | None = None


class ConsoleSendRequest(BaseModel):
    request: dict
    note: str = ""
    agentId: int | None = None
    instanceId: str | None = None


class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    organization: str = "OpenAN"
    description: str = ""
    layer: str = Field(default="service", pattern="^(service|network)$")
    networkDomain: str | None = Field(default=None, pattern="^(wireless|datacom|optical|cloudcore)$")

    @model_validator(mode="after")
    def _check_group(self):
        if self.layer == "network" and not self.networkDomain:
            raise ValueError("网络层 Agent 必须选择所属子域")
        if self.layer == "service":
            self.networkDomain = None
        return self


class AgentPatch(BaseModel):
    description: str | None = None
    enabled: bool | None = None
    layer: str | None = Field(default=None, pattern="^(service|network)$")
    networkDomain: str | None = Field(default=None, pattern="^(wireless|datacom|optical|cloudcore)$")

    @model_validator(mode="after")
    def _check_group(self):
        if self.layer == "network" and not self.networkDomain:
            raise ValueError("网络层 Agent 必须选择所属子域")
        return self


class ServiceUrlsUpdate(BaseModel):
    registryUrl: str | None = None
    orchestrationUrl: str | None = None
    executionHostUrl: str | None = None
    ontologyUrl: str | None = None

    @field_validator("registryUrl", "orchestrationUrl", "executionHostUrl", "ontologyUrl")
    @classmethod
    def _http_url(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("http://", "https://")):
            raise ValueError("must start with http:// or https://")
        return value


class DebugProxyRequest(BaseModel):
    method: str = Field(pattern="^(GET|POST|PUT|DELETE|PATCH)$")
    path: str
    headers: dict[str, str] | None = None
    body: dict | list | str | None = None
    timeoutSeconds: int = Field(default=120, ge=1, le=300)

    @field_validator("path")
    @classmethod
    def _rooted_path(cls, value: str) -> str:
        if not value.startswith("/"):
            raise ValueError("path must start with /")
        return value
