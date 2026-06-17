fn main() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::ERROR)
        .init();
    if let Err(error) =
        secure_exec_sidecar::stdio::run_with_extensions(agent_os_sidecar_wrapper::extensions())
    {
        tracing::error!(?error, "agent-os-sidecar startup failed");
        std::process::exit(1);
    }
}
