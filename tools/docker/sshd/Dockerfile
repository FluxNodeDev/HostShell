# HostShell 联调用的最小 SSH 服务器（debian + openssh + lrzsz）
# 构建： docker build -t hostshell/sshd:latest tools/docker/sshd
# 运行： docker run -d --name hostshell-sshd -p 127.0.0.1:2223:2222 hostshell/sshd:latest
# 登录： root / hostshell
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-server lrzsz procps bash ca-certificates \
 && mkdir -p /run/sshd \
 && echo 'root:hostshell' | chpasswd \
 && sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config \
 && sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config \
 && rm -rf /var/lib/apt/lists/*

EXPOSE 2222
CMD ["/usr/sbin/sshd", "-D", "-p", "2222", "-e"]
