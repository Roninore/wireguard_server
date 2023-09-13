FROM node:18.12

WORKDIR /wireguard_server

COPY . .

RUN apt-get -y clean && apt-get -y update
RUN mkdir /etc/wireguard/
RUN npm ci
RUN npm run create-config

RUN apt install -y iproute2
RUN apt install -y iptables
RUN apt install -y ufw
RUN apt install -y wireguard

RUN echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
RUN sysctl -p

CMD npm start