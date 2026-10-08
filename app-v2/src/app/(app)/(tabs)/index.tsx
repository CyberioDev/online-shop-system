import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { api } from '@/api';
import { useUser } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Column, Columns, Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { formatLongDate, formatMoney, formatRelative, toDayKey, addDays } from '@/lib/format';
import { CHANNEL_LABELS, orderStatusLabel } from '@/lib/labels';
import { makeStyles, useColors } from '@/theme';

export default function HomeScreen() {
 const colors=useColors(), styles=useStyles(), wide=useIsWide(), user=useUser();
 const {data,error,reload}=useResource(async()=>{
  const now=new Date();
  const [today,integrations,report]=await Promise.all([api.getTodaySummary(),api.getIntegrations(),api.getReport({from:toDayKey(addDays(now,-6)),to:toDayKey(now)})]);
  const daily = await Promise.all(Array.from({length: 7}, (_, i) => {
   const day = toDayKey(addDays(now, i - 6));
   return api.getReport({from: day, to: day}).then(result => ({day, revenue: result.revenue}));
  }));
  return {today,integrations,report,daily};
 },[]);
 useReloadOnFocus(reload);
 return <Screen>
  <View style={[styles.header, !wide && styles.headerMobile]}><View style={styles.flex}><Text variant="caption" color={colors.textSecondary}>{formatLongDate(new Date())}</Text><Text variant="display">Таны бизнес. Нэг дор.</Text><Text color={colors.textSecondary}>Сайн байна уу, {user.name}.</Text></View><Button title="Бараа нэмэх" icon="plus" size="md" onPress={()=>router.push('/product/new')} /></View>
  {!data?<LoadState error={error} onRetry={reload}/>:<View style={styles.body}>
   <View style={[styles.overview,!wide&&styles.stacked]}>
    <View nativeID="studio-revenue" style={styles.revenue}>
     <View style={styles.between}><Text variant="label" color={colors.primaryOnDark}>Өнөөдрийн орлого</Text><Icon name="arrow-up-right" color={colors.primaryOnDark} size={24}/></View>
     <Text variant="hero" color={colors.textOnPrimary} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(data.today.revenue)}</Text>
     <Text variant="caption" color={colors.primaryOnDark}>Борлуулалт · 7 хоног</Text>
     <View style={styles.trend} accessibilityLabel={`Өдрийн борлуулалт: ${data.daily.map(day => `${day.day}: ${formatMoney(day.revenue)}`).join(', ')}`}>
      {data.daily.map(day => <View key={day.day} style={styles.trendColumn}>
       <View style={styles.trendTrack}><View style={[styles.trendBar, {height: `${day.revenue / Math.max(1, ...data.daily.map(d => d.revenue)) * 100}%`}]} /></View>
       <Text style={styles.trendLabel} color={colors.primaryOnDark}>{Number(day.day.slice(-2))}</Text>
      </View>)}
     </View>
     <View style={styles.between}><Text variant="caption" color={colors.primaryOnDark}>{data.today.paidCount} төлөгдсөн захиалга</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/report')}><Text variant="label" color={colors.textOnPrimary}>Тайлан харах ↗</Text></Pressable></View>
    </View>
    <View style={styles.metrics}>
     <Metric icon="shopping-bag" label="Төлөгдсөн" value={data.today.paidCount} onPress={()=>router.push('/orders')}/>
     <Metric icon="clock" label="Хүлээгдэж буй" value={data.today.awaitingCount} onPress={()=>router.push('/orders')}/>
     <Metric icon="check-square" label="Шалгах төлбөр" value={data.today.reviewCount} onPress={()=>router.push('/review')}/>
    </View>
   </View>
   <Pressable accessibilityRole="button" style={styles.reviewAction} onPress={()=>router.push('/review')}><View style={styles.iconBox}><Icon name={data.today.reviewCount?'alert-circle':'check'} color={colors.primary} size={21}/></View><View style={styles.flex}><Text variant="label">{data.today.reviewCount?`${data.today.reviewCount} төлбөр таны анхаарлыг хүлээж байна`:'Шалгах төлбөр алга'}</Text><Text variant="caption" color={colors.textSecondary}>Төлбөрөө захиалгатай холбоорой</Text></View><Icon name="arrow-right" color={colors.primary} size={20}/></Pressable>
   <Columns gap={Spacing.six}>
    <Column gap={Spacing.three}><View style={styles.between}><Text variant="heading">Сүүлийн захиалгууд</Text><Button title="Бүгд" size="sm" variant="ghost" onPress={()=>router.push('/orders')}/></View><Card padded={false}>
     {data.today.recent.length===0?<Text style={styles.empty} color={colors.textSecondary}>Одоогоор захиалга алга.</Text>:data.today.recent.slice(0,6).map((order,index)=><Pressable key={order.id} accessibilityRole="button" accessibilityLabel={`Захиалга ${order.code}`} onPress={()=>router.push({pathname:'/order/[id]',params:{id:order.id}})} style={({pressed})=>[styles.activity,index>0&&styles.divider,pressed&&{backgroundColor:colors.surfaceMuted}]}><View style={styles.avatar}><Text variant="label" color={colors.primary}>{order.customerName.slice(0,1)}</Text></View><View style={styles.flex}><Text variant="bodyMedium">{order.customerName}</Text><Text variant="caption" color={colors.textSecondary}>#{order.code} · {orderStatusLabel(order)}</Text></View><View style={styles.right}><Text variant="label">{formatMoney(order.total)}</Text><Text variant="caption" color={colors.textMuted}>{formatRelative(order.createdAt)}</Text></View></Pressable>)}
    </Card></Column>
    <Column gap={Spacing.five}><Text variant="heading">Сүүлийн 7 хоног</Text><Card style={styles.channelCard}><Text variant="caption" color={colors.textSecondary}>Баталгаажсан захиалга · сувгаар</Text>
     {data.report.byChannel.length===0?<Text color={colors.textSecondary}>Энэ хугацаанд борлуулалт алга.</Text>:data.report.byChannel.map(channel=><View key={channel.channel} style={styles.channel}><View style={styles.between}><Text variant="captionMedium">{CHANNEL_LABELS[channel.channel]}</Text><Text variant="label">{channel.count}</Text></View><View style={styles.track}><View style={[styles.bar,{width:`${channel.count/Math.max(1,...data.report.byChannel.map(c=>c.count))*100}%`}]}/></View></View>)}
    </Card><Pressable accessibilityRole="button" onPress={()=>router.push('/integrations')} style={styles.bank}><View style={styles.iconBox}><Icon name="radio" color={colors.primary} size={20}/></View><View style={styles.flex}><Text variant="label">Банкны SMS</Text><Text variant="caption" color={colors.textSecondary}>{data.integrations.sms.lastReceivedAt?`Хүлээн авсан · ${formatRelative(data.integrations.sms.lastReceivedAt)}`:'Холболт тохируулах'}</Text></View><Text variant="caption" color={colors.primary}>{data.integrations.sms.connected?'Идэвхтэй':'Тохируулах'}</Text><Icon name="chevron-right" size={18} color={colors.textMuted}/></Pressable></Column>
   </Columns>
  </View>}
 </Screen>;
}
function Metric({icon,label,value,onPress}:{icon:IconName;label:string;value:number;onPress:()=>void}) {
 const styles=useStyles(),colors=useColors();
 return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[styles.metric,pressed&&{backgroundColor:colors.surfaceMuted}]}><Icon name={icon} size={20} color={colors.primary}/><Text style={styles.metricValue}>{value}</Text><Text variant="caption" color={colors.textSecondary}>{label}</Text></Pressable>;
}
const useStyles=makeStyles(colors=>({
 trend:{flexDirection:'row',gap:Spacing.three,marginTop:Spacing.two},trendColumn:{flex:1,gap:Spacing.two,alignItems:'center'},trendTrack:{height:48,width:'100%',justifyContent:'flex-end',borderBottomWidth:1,borderBottomColor:'rgba(183,237,220,.24)'},trendBar:{backgroundColor:'#9EDDBF',borderTopLeftRadius:5,borderTopRightRadius:5,width:'100%'},trendLabel:{fontSize:10,lineHeight:14},
 headerMobile:{flexDirection:'column',alignItems:'stretch'},flex:{flex:1,minWidth:0},header:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:Spacing.four,marginBottom:Spacing.eight},body:{gap:Spacing.six},between:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:Spacing.two},
 overview:{flexDirection:'row',gap:Spacing.five},stacked:{flexDirection:'column'},revenue:{flex:1,backgroundColor:'#172C28',borderRadius:Radius.xl,padding:Spacing.six,minHeight:310,justifyContent:'space-between',gap:Spacing.five},metrics:{flex:1,flexDirection:'row',flexWrap:'wrap',gap:Spacing.three},metric:{flex:1,minWidth:100,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:Radius.lg,padding:Spacing.four,justifyContent:'space-between',gap:Spacing.three},metricValue:{fontFamily:Fonts.display,fontSize:36,lineHeight:46,letterSpacing:-1},
 reviewAction:{flexDirection:'row',alignItems:'center',gap:Spacing.three,padding:Spacing.four,borderRadius:Radius.lg,backgroundColor:colors.primarySoft},iconBox:{width:40,height:40,borderRadius:Radius.md,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center'},activity:{flexDirection:'row',alignItems:'center',gap:Spacing.three,padding:Spacing.four},divider:{borderTopWidth:1,borderTopColor:colors.border},avatar:{width:40,height:40,borderRadius:Radius.md,backgroundColor:colors.surfaceMuted,alignItems:'center',justifyContent:'center'},right:{alignItems:'flex-end',gap:Spacing.one},empty:{padding:Spacing.six},channelCard:{gap:Spacing.four},channel:{gap:Spacing.two},track:{height:6,borderRadius:Radius.pill,backgroundColor:colors.surfaceMuted},bar:{height:6,borderRadius:Radius.pill,backgroundColor:colors.primary},bank:{flexDirection:'row',alignItems:'center',gap:Spacing.three,padding:Spacing.four,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:Radius.lg},
}));
